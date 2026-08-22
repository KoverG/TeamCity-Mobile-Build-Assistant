import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abortBoundedTeamCityRequest,
  fetchBoundedTeamCityResponse,
  maximumTeamCityResponseBytes,
} from '../../src/background/boundedTeamCityFetch'

const origin = 'https://teamcity.example.test'
const path = '/app/rest/buildTypes'
const encoder = new TextEncoder()

function streamingResponse(
  chunks: readonly Uint8Array[],
  headers: Record<string, string> = {},
  responseUrl = `${origin}${path}`,
) {
  let index = 0
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index]
      index += 1
      if (chunk === undefined) {
        controller.close()
      } else {
        controller.enqueue(chunk)
      }
    },
    cancel,
  })
  const response = new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
  Object.defineProperty(response, 'url', { value: responseUrl })
  return { response, cancel }
}

async function request(
  response: Response,
  maximumBytes: number,
  requireCurrentOrigin = false,
) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  const result = await fetchBoundedTeamCityResponse(
    origin,
    path,
    maximumBytes,
    1_000,
    'include',
    'service-worker',
    requireCurrentOrigin,
  )
  return { result, fetchMock }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchBoundedTeamCityResponse', () => {
  it('decodes UTF-8 correctly when a character is split across stream chunks', async () => {
    const text = '{"message":"Привет"}'
    const bytes = encoder.encode(text)
    const { response } = streamingResponse([
      bytes.slice(0, 13),
      bytes.slice(13),
    ])

    const { result } = await request(response, bytes.byteLength)

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      bodyText: text,
      truncated: false,
      transport: 'service-worker',
      error: undefined,
    })
  })

  it('accepts a response exactly at the byte limit', async () => {
    const bytes = encoder.encode('{"ok":true}')
    const { response } = streamingResponse([bytes])

    const { result } = await request(response, bytes.byteLength)

    expect(result.bodyText).toBe('{"ok":true}')
    expect(result.truncated).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('cancels the stream immediately after the byte limit is exceeded', async () => {
    const { response, cancel } = streamingResponse([
      encoder.encode('1234'),
      encoder.encode('5'),
      encoder.encode('never-read'),
    ])

    const { result } = await request(response, 4)

    expect(result).toMatchObject({
      bodyText: '',
      truncated: true,
      error: 'response-too-large',
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects an advertised oversized response before reading its body', async () => {
    const { response, cancel } = streamingResponse(
      [encoder.encode('small')],
      { 'content-length': '100' },
    )

    const { result } = await request(response, 10)

    expect(result).toMatchObject({
      bodyText: '',
      truncated: true,
      error: 'response-too-large',
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects a response redirected outside the trusted TeamCity origin', async () => {
    const { response, cancel } = streamingResponse(
      [encoder.encode('{"ok":true}')],
      {},
      'https://redirect.example.invalid/app/rest/buildTypes',
    )

    const { result } = await request(response, maximumTeamCityResponseBytes)

    expect(result.error).toBe('invalid-request')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('requires the injected MAIN-world function to run on the expected origin', async () => {
    const { response } = streamingResponse([encoder.encode('{"ok":true}')])

    const { result, fetchMock } = await request(
      response,
      maximumTeamCityResponseBytes,
      true,
    )

    expect(result.error).toBe('invalid-request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid byte limit without starting a request', async () => {
    const { response } = streamingResponse([encoder.encode('{"ok":true}')])

    const { result, fetchMock } = await request(response, Number.NaN)

    expect(result.error).toBe('invalid-request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts an active request by its cross-context request id', async () => {
    const requestId = 'request_active'
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    ))
    vi.stubGlobal('fetch', fetchMock)
    const pending = fetchBoundedTeamCityResponse(
      origin,
      path,
      maximumTeamCityResponseBytes,
      1_000,
      'include',
      'service-worker',
      false,
      requestId,
    )

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(abortBoundedTeamCityRequest(requestId)).toBe(true)

    await expect(pending).resolves.toMatchObject({ error: 'timeout' })

    const retryBody = encoder.encode('{"retry":true}')
    const { response: retryResponse } = streamingResponse([retryBody])
    const retryFetch = vi.fn().mockResolvedValue(retryResponse)
    vi.stubGlobal('fetch', retryFetch)

    const retryResult = await fetchBoundedTeamCityResponse(
      origin,
      path,
      maximumTeamCityResponseBytes,
      1_000,
      'include',
      'service-worker',
      false,
      requestId,
    )

    expect(retryResult).toMatchObject({ ok: true, bodyText: '{"retry":true}' })
  })

  it('aborts a request when its timeout expires', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBoundedTeamCityResponse(
      origin,
      path,
      maximumTeamCityResponseBytes,
      1,
      'include',
      'service-worker',
      false,
      'request_timeout',
    )

    expect(result.error).toBe('timeout')
  })

  it('honours cancellation that reaches the MAIN world before fetch starts', async () => {
    const requestId = 'request_before_start'
    abortBoundedTeamCityRequest(requestId)
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return Promise.reject(new Error('Expected an aborted signal'))
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBoundedTeamCityResponse(
      origin,
      path,
      maximumTeamCityResponseBytes,
      1_000,
      'same-origin',
      'main-world',
      false,
      requestId,
    )

    expect(result.error).toBe('timeout')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
