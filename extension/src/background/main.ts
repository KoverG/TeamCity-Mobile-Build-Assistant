import {
  isOpenTeamCityArtifactRequest,
  isOpenTeamCityBuildRequest,
  isTeamCityCancelRequest,
  isTeamCityGetRequest,
  type TeamCityRawResponse,
  type TeamCityTransportKind,
} from '../teamcity/contracts'
import { normalizeTeamCityRestPath } from '../teamcity/restPath'
import {
  abortBoundedTeamCityRequest,
  fetchBoundedTeamCityResponse,
  maximumTeamCityResponseBytes,
} from './boundedTeamCityFetch'
import { openTeamCityArtifactTab } from './openTeamCityArtifactTab'
import { openTeamCityBuildTab } from './openTeamCityBuildTab'

const contentScriptId = 'teamcity-mobile-build-assistant'
const defaultRequestTimeoutMs = 15_000
const maximumRequestTimeoutMs = 30_000

interface ActiveTeamCityRequest {
  tabId: number
  route: TeamCityTransportKind
  cancelled: boolean
}

const activeTeamCityRequests = new Map<string, ActiveTeamCityRequest>()

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) {
    return defaultRequestTimeoutMs
  }

  return Math.min(Math.max(Math.trunc(timeoutMs), 1_000), maximumRequestTimeoutMs)
}

function getOriginPattern(rawUrl: string): string {
  const url = new URL(rawUrl)

  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS origins are supported.')
  }

  return `${url.origin}/*`
}

function createFailure(
  transport: TeamCityTransportKind,
  error: TeamCityRawResponse['error'],
): TeamCityRawResponse {
  return {
    ok: false,
    status: 0,
    contentType: '',
    bodyText: '',
    redirectedToLogin: false,
    truncated: false,
    transport,
    error,
  }
}

async function fetchFromServiceWorker(
  origin: string,
  path: string,
  timeoutMs: number,
  requestId: string,
): Promise<TeamCityRawResponse> {
  return fetchBoundedTeamCityResponse(
    origin,
    path,
    maximumTeamCityResponseBytes,
    timeoutMs,
    'include',
    'service-worker',
    false,
    requestId,
  )
}

async function fetchFromMainWorld(
  tabId: number,
  origin: string,
  path: string,
  timeoutMs: number,
  requestId: string,
): Promise<TeamCityRawResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [
        origin,
        path,
        maximumTeamCityResponseBytes,
        timeoutMs,
        'same-origin',
        'main-world',
        true,
        requestId,
      ],
      func: fetchBoundedTeamCityResponse,
    })

    return results[0]?.result ?? createFailure('main-world', 'tab-unavailable')
  } catch {
    return createFailure('main-world', 'network')
  }
}

function isUsableJson(response: TeamCityRawResponse): boolean {
  return (
    response.ok &&
    !response.redirectedToLogin &&
    !response.truncated &&
    response.contentType.toLowerCase().includes('json')
  )
}

async function executeTeamCityGet(
  requestId: string,
  path: string,
  sender: chrome.runtime.MessageSender,
  timeoutMs: number | undefined,
  activeRequest: ActiveTeamCityRequest,
): Promise<TeamCityRawResponse> {
  let normalizedPath: string

  try {
    normalizedPath = normalizeTeamCityRestPath(path)
  } catch {
    return createFailure('service-worker', 'invalid-request')
  }

  const tabId = sender.tab?.id
  const tabUrl = sender.tab?.url

  if (tabId === undefined || tabUrl === undefined) {
    return createFailure('service-worker', 'tab-unavailable')
  }

  let origin: string

  try {
    const pageUrl = new URL(tabUrl)
    if (pageUrl.protocol !== 'https:') {
      return createFailure('service-worker', 'invalid-request')
    }
    origin = pageUrl.origin
  } catch {
    return createFailure('service-worker', 'invalid-request')
  }

  const normalizedTimeout = normalizeTimeout(timeoutMs)
  const serviceWorkerResponse = await fetchFromServiceWorker(
    origin,
    normalizedPath,
    normalizedTimeout,
    requestId,
  )

  if (isUsableJson(serviceWorkerResponse)) {
    return { ...serviceWorkerResponse, attemptedTransports: ['service-worker'] }
  }

  if (serviceWorkerResponse.error === 'timeout') {
    return { ...serviceWorkerResponse, attemptedTransports: ['service-worker'] }
  }

  activeRequest.route = 'main-world'
  if (activeRequest.cancelled) {
    return {
      ...createFailure('main-world', 'timeout'),
      attemptedTransports: ['service-worker', 'main-world'],
    }
  }

  const pageResponse = await fetchFromMainWorld(
    tabId,
    origin,
    normalizedPath,
    normalizedTimeout,
    requestId,
  )
  if (pageResponse.error !== undefined && serviceWorkerResponse.status > 0) {
    return {
      ...serviceWorkerResponse,
      attemptedTransports: ['service-worker', 'main-world'],
    }
  }

  return {
    ...pageResponse,
    attemptedTransports: ['service-worker', 'main-world'],
  }
}

async function executeTrackedTeamCityGet(
  requestId: string,
  path: string,
  sender: chrome.runtime.MessageSender,
  timeoutMs: number | undefined,
): Promise<TeamCityRawResponse> {
  const tabId = sender.tab?.id
  if (tabId === undefined || activeTeamCityRequests.has(requestId)) {
    return createFailure(
      'service-worker',
      tabId === undefined ? 'tab-unavailable' : 'invalid-request',
    )
  }

  const activeRequest: ActiveTeamCityRequest = {
    tabId,
    route: 'service-worker',
    cancelled: false,
  }
  activeTeamCityRequests.set(requestId, activeRequest)

  try {
    return await executeTeamCityGet(requestId, path, sender, timeoutMs, activeRequest)
  } finally {
    if (activeTeamCityRequests.get(requestId) === activeRequest) {
      activeTeamCityRequests.delete(requestId)
    }
  }
}

async function cancelTeamCityRequest(
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const activeRequest = activeTeamCityRequests.get(requestId)
  if (activeRequest === undefined || sender.tab?.id !== activeRequest.tabId) {
    return
  }

  activeRequest.cancelled = true
  if (activeRequest.route === 'service-worker') {
    abortBoundedTeamCityRequest(requestId)
    return
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeRequest.tabId },
      world: 'MAIN',
      args: [requestId],
      func: abortBoundedTeamCityRequest,
    })
  } catch {
    // The page may have closed while its request was being cancelled.
  }
}

async function registerOrigin(originPattern: string): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [contentScriptId],
  })
  const existingMatches = registered.flatMap((script) => script.matches ?? [])

  if (existingMatches.includes(originPattern)) {
    return
  }

  const matches = [...new Set([...existingMatches, originPattern])]
  const registration: chrome.scripting.RegisteredContentScript = {
    id: contentScriptId,
    js: ['content.js'],
    matches,
    persistAcrossSessions: true,
    runAt: 'document_idle',
  }

  if (registered.length === 0) {
    await chrome.scripting.registerContentScripts([registration])
    return
  }

  await chrome.scripting.updateContentScripts([registration])
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined || tab.url === undefined) {
    return
  }

  try {
    const originPattern = getOriginPattern(tab.url)
    const granted = await chrome.permissions.request({ origins: [originPattern] })

    if (!granted) {
      return
    }

    await registerOrigin(originPattern)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    })
  } catch {
    console.warn('The extension could not be activated on the current page.')
  }
})

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isTeamCityCancelRequest(message)) {
    void cancelTeamCityRequest(message.requestId, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (isOpenTeamCityArtifactRequest(message)) {
    void openTeamCityArtifactTab(message.contentHref, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: 'open-failed' }))
    return true
  }

  if (isOpenTeamCityBuildRequest(message)) {
    void openTeamCityBuildTab(message.buildId, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: 'open-failed' }))
    return true
  }

  if (!isTeamCityGetRequest(message)) {
    return false
  }

  void executeTrackedTeamCityGet(message.requestId, message.path, sender, message.timeoutMs)
    .then(sendResponse)
    .catch(() => sendResponse(createFailure('service-worker', 'network')))

  return true
})
