import {
  isTeamCityRawResponse,
  type TeamCityGetRequest,
  type TeamCityRawResponse,
  type TeamCityTransportKind,
} from './contracts'
import { TeamCityError } from './TeamCityError'

export interface TeamCityJsonResult<T> {
  data: T
  transport: TeamCityTransportKind
  status: number
}

export interface TeamCityHttpClient {
  getJson<T>(path: string, options?: TeamCityRequestOptions): Promise<TeamCityJsonResult<T>>
}

export interface TeamCityRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface TeamCityTransportRequestEvent {
  path: string
  url: string
  timeoutMs: number
}

export interface TeamCityTransportResponseEvent {
  request: TeamCityTransportRequestEvent
  response: TeamCityRawResponse
  elapsedMs: number
  transportRoute: string
}

export interface TeamCityTransportErrorEvent {
  request: TeamCityTransportRequestEvent
  error: unknown
  elapsedMs: number
  transportRoute: string
}

export interface TeamCityTransportObserver {
  requestStarted?(event: TeamCityTransportRequestEvent): void
  responseReceived?(event: TeamCityTransportResponseEvent): void
  requestFailed?(event: TeamCityTransportErrorEvent): void
}

function notifyObserver(callback: (() => void) | undefined): void {
  try {
    callback?.()
  } catch {
    // Observability must never affect the TeamCity request.
  }
}

export function parseTeamCityResponse<T>(response: TeamCityRawResponse): TeamCityJsonResult<T> {
  if (response.error === 'invalid-request') {
    throw new TeamCityError('InvalidRequest', 'TeamCity REST request was rejected.')
  }

  if (response.error === 'response-too-large' || response.truncated) {
    throw new TeamCityError('ResponseTooLarge', 'TeamCity response exceeded the safety limit.')
  }

  if (response.error === 'timeout') {
    throw new TeamCityError('RequestTimeout', 'TeamCity request timed out.')
  }

  if (response.status === 401 || response.redirectedToLogin) {
    throw new TeamCityError('NotAuthenticated', 'TeamCity authentication is required.')
  }

  if (response.status === 403) {
    throw new TeamCityError('Forbidden', 'TeamCity denied access to this resource.')
  }

  if (response.error !== undefined || response.status === 0) {
    throw new TeamCityError('TeamCityUnavailable', 'TeamCity request could not be completed.')
  }

  if (!response.ok) {
    throw new TeamCityError('UnexpectedResponse', 'TeamCity returned an unexpected status.')
  }

  const normalizedContentType = response.contentType.toLowerCase()
  const bodyLooksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(response.bodyText)

  if (bodyLooksLikeHtml) {
    throw new TeamCityError('NotAuthenticated', 'TeamCity returned a login page.')
  }

  if (!normalizedContentType.includes('json')) {
    throw new TeamCityError('UnexpectedResponse', 'TeamCity did not return JSON.')
  }

  try {
    return {
      data: JSON.parse(response.bodyText) as T,
      transport: response.transport,
      status: response.status,
    }
  } catch {
    throw new TeamCityError('UnexpectedResponse', 'TeamCity returned invalid JSON.')
  }
}

export class BrowserSessionTeamCityTransport implements TeamCityHttpClient {
  public constructor(private readonly observer?: TeamCityTransportObserver) {}

  public async getJson<T>(
    path: string,
    options: TeamCityRequestOptions = {},
  ): Promise<TeamCityJsonResult<T>> {
    if (options.signal?.aborted) {
      throw new TeamCityError('RequestTimeout', 'TeamCity request was aborted.')
    }

    const requestUrl = new URL(path, window.location.origin).toString()
    const startedAt = Date.now()
    let transportRoute = 'runtime-message'
    let responseObserved = false
    const requestEvent: TeamCityTransportRequestEvent = {
      path,
      url: requestUrl,
      timeoutMs: options.timeoutMs ?? 15_000,
    }
    notifyObserver(() => this.observer?.requestStarted?.(requestEvent))

    const request: TeamCityGetRequest = {
      type: 'teamcity:get',
      path,
      timeoutMs: options.timeoutMs,
    }
    try {
      const responsePromise = chrome.runtime.sendMessage(request)
      const rawResponse: unknown = options.signal === undefined
        ? await responsePromise
        : await new Promise((resolve, reject) => {
            const abort = () => reject(new TeamCityError('RequestTimeout', 'TeamCity request was aborted.'))
            options.signal?.addEventListener('abort', abort, { once: true })
            void responsePromise.then(resolve, reject).finally(() => {
              options.signal?.removeEventListener('abort', abort)
            })
          })

      if (!isTeamCityRawResponse(rawResponse)) {
        throw new TeamCityError('UnexpectedResponse', 'Extension transport returned an invalid response.')
      }

      transportRoute = (rawResponse.attemptedTransports ?? [rawResponse.transport]).join(' → ')
      notifyObserver(() => this.observer?.responseReceived?.({
        request: requestEvent,
        response: rawResponse,
        elapsedMs: Date.now() - startedAt,
        transportRoute,
      }))
      responseObserved = true
      const result = parseTeamCityResponse<T>(rawResponse)
      return result
    } catch (error) {
      if (!responseObserved) {
        notifyObserver(() => this.observer?.requestFailed?.({
          request: requestEvent,
          error,
          elapsedMs: Date.now() - startedAt,
          transportRoute,
        }))
      }
      throw error
    }
  }
}
