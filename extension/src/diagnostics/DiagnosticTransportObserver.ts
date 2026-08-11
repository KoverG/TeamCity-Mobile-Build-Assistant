import type { TeamCityRawResponse } from '../teamcity/contracts'
import { TeamCityError } from '../teamcity/TeamCityError'
import type {
  TeamCityTransportErrorEvent,
  TeamCityTransportObserver,
  TeamCityTransportRequestEvent,
  TeamCityTransportResponseEvent,
} from '../teamcity/TeamCityTransport'
import { DiagnosticEventStore } from './DiagnosticEventStore'

function describeRequest(path: string): string {
  if (path.includes('/users/current')) {
    return 'проверка TeamCity-сессии'
  }
  if (path.startsWith('/app/rest/buildTypes')) {
    return 'загрузка каталога configurations'
  }
  if (path.startsWith('/app/rest/builds?')) {
    return 'загрузка успешных builds'
  }
  if (path.includes('/artifacts/metadata')) {
    return 'metadata fallback для artifact'
  }
  if (path.includes('/artifacts/children')) {
    return 'children fallback для artifacts'
  }
  if (path.includes('/artifacts')) {
    return 'bulk listing artifacts'
  }
  return 'TeamCity REST GET'
}

function describeTransportError(error: unknown): string {
  return error instanceof TeamCityError ? error.code : 'RuntimeError'
}

function responseLevel(response: TeamCityRawResponse): 'success' | 'error' {
  return response.ok ? 'success' : 'error'
}

export class DiagnosticTransportObserver implements TeamCityTransportObserver {
  public constructor(private readonly store: DiagnosticEventStore) {}

  public requestStarted(event: TeamCityTransportRequestEvent): void {
    this.store.emit(
      'TeamCity',
      'info',
      `→ GET: ${describeRequest(event.path)} · timeout ${event.timeoutMs} ms`,
      { kind: 'request', url: event.url },
    )
  }

  public responseReceived(event: TeamCityTransportResponseEvent): void {
    const description = describeRequest(event.request.path)
    const message = event.response.status > 0
      ? `← HTTP ${event.response.status}: ${description} · ${event.elapsedMs} ms · ${event.transportRoute}`
      : `× ${description} · ${event.elapsedMs} ms · ${event.transportRoute} · ${event.response.error ?? 'NoResponse'}`
    this.store.emit(
      'TeamCity',
      responseLevel(event.response),
      message,
      {
        kind: 'response',
        url: event.request.url,
        status: event.response.status,
        contentType: event.response.contentType,
        bodyText: event.response.bodyText,
      },
    )
  }

  public requestFailed(event: TeamCityTransportErrorEvent): void {
    this.store.emit(
      'TeamCity',
      'error',
      `× ${describeRequest(event.request.path)} · ${event.elapsedMs} ms · ${event.transportRoute} · ${describeTransportError(event.error)}`,
      { kind: 'request', url: event.request.url },
    )
  }
}
