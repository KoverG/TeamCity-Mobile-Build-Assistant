import type { TeamCityRawResponse, TeamCityTransportKind } from '../teamcity/contracts'

export const maximumTeamCityResponseBytes = 4 * 1024 * 1024

export function abortBoundedTeamCityRequest(requestId: string): boolean {
  type RequestRegistry = {
    controllers: Map<string, AbortController>
    cancelled: Set<string>
  }

  const registryKey = Symbol.for('teamcity-mobile-build-assistant.active-fetches')
  const registryHost = globalThis as unknown as Record<symbol, RequestRegistry | undefined>
  const registry = registryHost[registryKey] ?? {
    controllers: new Map<string, AbortController>(),
    cancelled: new Set<string>(),
  }
  registryHost[registryKey] = registry
  const controller = registry.controllers.get(requestId)
  if (controller !== undefined) {
    controller.abort()
    return true
  }

  registry.cancelled.add(requestId)
  setTimeout(() => registry.cancelled.delete(requestId), 60_000)
  return false
}

export async function fetchBoundedTeamCityResponse(
  origin: string,
  path: string,
  maximumBytes: number,
  timeoutMs: number,
  credentials: RequestCredentials,
  transport: TeamCityTransportKind,
  requireCurrentOrigin: boolean,
  requestId?: string,
): Promise<TeamCityRawResponse> {
  type RequestRegistry = {
    controllers: Map<string, AbortController>
    cancelled: Set<string>
  }

  const createFailure = (error: TeamCityRawResponse['error']): TeamCityRawResponse => ({
    ok: false,
    status: 0,
    contentType: '',
    bodyText: '',
    redirectedToLogin: false,
    truncated: false,
    transport,
    error,
  })

  const cancelBody = async (body: ReadableStream<Uint8Array> | null): Promise<void> => {
    try {
      await body?.cancel()
    } catch {
      // Cancellation is best-effort after the response has already been rejected.
    }
  }

  const readBody = async (
    response: Response,
    byteLimit: number,
  ): Promise<{ bodyText: string; exceeded: boolean }> => {
    const rawContentLength = response.headers.get('content-length')
    if (rawContentLength !== null) {
      const contentLength = Number(rawContentLength)
      if (Number.isFinite(contentLength) && contentLength >= 0 && contentLength > byteLimit) {
        await cancelBody(response.body)
        return { bodyText: '', exceeded: true }
      }
    }

    if (response.body === null) {
      return { bodyText: '', exceeded: false }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    let receivedBytes = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          chunks.push(decoder.decode())
          return { bodyText: chunks.join(''), exceeded: false }
        }

        receivedBytes += value.byteLength
        if (receivedBytes > byteLimit) {
          try {
            await reader.cancel()
          } catch {
            // The safety decision does not depend on cancellation support.
          }
          return { bodyText: '', exceeded: true }
        }
        chunks.push(decoder.decode(value, { stream: true }))
      }
    } finally {
      reader.releaseLock()
    }
  }

  let expectedOrigin: URL
  let requestUrl: URL
  try {
    expectedOrigin = new URL(origin)
    requestUrl = new URL(path, expectedOrigin)
  } catch {
    return createFailure('invalid-request')
  }

  const currentOrigin = typeof location === 'undefined' ? undefined : location.origin
  if (
    expectedOrigin.protocol !== 'https:' ||
    expectedOrigin.origin !== origin ||
    requestUrl.origin !== expectedOrigin.origin ||
    requestUrl.hash.length > 0 ||
    (requestUrl.pathname !== '/app/rest' && !requestUrl.pathname.startsWith('/app/rest/')) ||
    (requireCurrentOrigin && currentOrigin !== expectedOrigin.origin)
  ) {
    return createFailure('invalid-request')
  }

  if (!Number.isFinite(maximumBytes) || maximumBytes < 1) {
    return createFailure('invalid-request')
  }
  const byteLimit = Math.trunc(maximumBytes)
  const controller = new AbortController()
  const registryKey = Symbol.for('teamcity-mobile-build-assistant.active-fetches')
  const registryHost = globalThis as unknown as Record<symbol, RequestRegistry | undefined>
  const registry = registryHost[registryKey] ?? {
    controllers: new Map<string, AbortController>(),
    cancelled: new Set<string>(),
  }
  registryHost[registryKey] = registry
  if (requestId !== undefined) {
    registry.controllers.set(requestId, controller)
    if (registry.cancelled.delete(requestId)) {
      controller.abort()
    }
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials,
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    const finalUrl = new URL(response.url || requestUrl.toString())
    if (finalUrl.origin !== expectedOrigin.origin) {
      await cancelBody(response.body)
      return createFailure('invalid-request')
    }

    const body = await readBody(response, byteLimit)
    const finalPath = finalUrl.pathname.toLowerCase()
    const redirectedToLogin =
      finalPath === '/login.html' ||
      finalPath.endsWith('/login.html') ||
      finalPath.endsWith('/login')

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      bodyText: body.bodyText,
      redirectedToLogin,
      truncated: body.exceeded,
      transport,
      error: body.exceeded ? 'response-too-large' : undefined,
    }
  } catch (error) {
    const aborted =
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
    return createFailure(aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timeout)
    if (requestId !== undefined && registry.controllers.get(requestId) === controller) {
      registry.controllers.delete(requestId)
      registry.cancelled.delete(requestId)
    }
  }
}
