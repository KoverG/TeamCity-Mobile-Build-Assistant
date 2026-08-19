import {
  isOpenTeamCityArtifactRequest,
  isOpenTeamCityBuildRequest,
  isTeamCityGetRequest,
  type TeamCityRawResponse,
  type TeamCityTransportKind,
} from '../teamcity/contracts'
import { normalizeTeamCityRestPath } from '../teamcity/restPath'
import { openTeamCityArtifactTab } from './openTeamCityArtifactTab'
import { openTeamCityBuildTab } from './openTeamCityBuildTab'

const contentScriptId = 'teamcity-mobile-build-assistant'
const maximumResponseCharacters = 4_000_000
const defaultRequestTimeoutMs = 15_000
const maximumRequestTimeoutMs = 30_000

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

function isLoginPath(rawUrl: string): boolean {
  try {
    const path = new URL(rawUrl).pathname.toLowerCase()
    return path === '/login.html' || path.endsWith('/login.html') || path.endsWith('/login')
  } catch {
    return false
  }
}

async function readResponse(
  response: Response,
  transport: TeamCityTransportKind,
): Promise<TeamCityRawResponse> {
  const bodyText = await response.text()
  const truncated = bodyText.length > maximumResponseCharacters

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    bodyText: truncated ? bodyText.slice(0, maximumResponseCharacters) : bodyText,
    redirectedToLogin: isLoginPath(response.url),
    truncated,
    transport,
    error: truncated ? 'response-too-large' : undefined,
  }
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
): Promise<TeamCityRawResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL(path, origin), {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    return await readResponse(response, 'service-worker')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return createFailure('service-worker', 'timeout')
    }
    return createFailure('service-worker', 'network')
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchFromMainWorld(
  tabId: number,
  path: string,
  timeoutMs: number,
): Promise<TeamCityRawResponse> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [path, maximumResponseCharacters, timeoutMs],
      func: async (requestPath: string, maximumCharacters: number, requestTimeoutMs: number) => {
        const createPageFailure = (): TeamCityRawResponse => ({
          ok: false,
          status: 0,
          contentType: '',
          bodyText: '',
          redirectedToLogin: false,
          truncated: false,
          transport: 'main-world',
          error: 'network',
        })

        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)

        try {
          const requestUrl = new URL(requestPath, window.location.origin)
          if (
            requestUrl.origin !== window.location.origin ||
            requestUrl.hash.length > 0 ||
            (requestUrl.pathname !== '/app/rest' &&
              !requestUrl.pathname.startsWith('/app/rest/'))
          ) {
            return {
              ...createPageFailure(),
              error: 'invalid-request' as const,
            }
          }

          const response = await fetch(requestUrl, {
            method: 'GET',
            credentials: 'same-origin',
            redirect: 'follow',
            headers: {
              Accept: 'application/json',
            },
            signal: controller.signal,
          })
          const rawBody = await response.text()
          const truncated = rawBody.length > maximumCharacters
          const finalPath = new URL(response.url).pathname.toLowerCase()

          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type') ?? '',
            bodyText: truncated ? rawBody.slice(0, maximumCharacters) : rawBody,
            redirectedToLogin:
              finalPath === '/login.html' ||
              finalPath.endsWith('/login.html') ||
              finalPath.endsWith('/login'),
            truncated,
            transport: 'main-world' as const,
            error: truncated ? ('response-too-large' as const) : undefined,
          }
        } catch (error) {
          return {
            ...createPageFailure(),
            error:
              error instanceof DOMException && error.name === 'AbortError'
                ? ('timeout' as const)
                : ('network' as const),
          }
        } finally {
          window.clearTimeout(timeout)
        }
      },
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
  path: string,
  sender: chrome.runtime.MessageSender,
  timeoutMs: number | undefined,
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
  const serviceWorkerResponse = await fetchFromServiceWorker(origin, normalizedPath, normalizedTimeout)

  if (isUsableJson(serviceWorkerResponse)) {
    return { ...serviceWorkerResponse, attemptedTransports: ['service-worker'] }
  }

  if (serviceWorkerResponse.error === 'timeout') {
    return { ...serviceWorkerResponse, attemptedTransports: ['service-worker'] }
  }

  const pageResponse = await fetchFromMainWorld(tabId, normalizedPath, normalizedTimeout)
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

  void executeTeamCityGet(message.path, sender, message.timeoutMs)
    .then(sendResponse)
    .catch(() => sendResponse(createFailure('service-worker', 'network')))

  return true
})
