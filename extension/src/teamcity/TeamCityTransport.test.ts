import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamCityRawResponse } from './contracts'
import {
  BrowserSessionTeamCityTransport,
  parseTeamCityResponse,
} from './TeamCityTransport'

afterEach(() => {
  vi.unstubAllGlobals()
})

function response(overrides: Partial<TeamCityRawResponse> = {}): TeamCityRawResponse {
  return {
    ok: true,
    status: 200,
    contentType: 'application/json; charset=utf-8',
    bodyText: '{"user":{"id":"synthetic-user"}}',
    redirectedToLogin: false,
    truncated: false,
    transport: 'main-world',
    ...overrides,
  }
}

describe('parseTeamCityResponse', () => {
  it('parses a JSON response without exposing transport internals', () => {
    const result = parseTeamCityResponse<{ user: { id: string } }>(response())

    expect(result).toEqual({
      data: { user: { id: 'synthetic-user' } },
      status: 200,
      transport: 'main-world',
    })
  })

  it('maps a login page to an authentication error', () => {
    try {
      parseTeamCityResponse(response({ contentType: 'text/html', bodyText: '<html>login</html>' }))
      throw new Error('Expected authentication error')
    } catch (error) {
      expect(error).toMatchObject({ code: 'NotAuthenticated' })
    }
  })

  it('rejects non-JSON success responses', () => {
    try {
      parseTeamCityResponse(response({ contentType: 'application/xml', bodyText: '<user />' }))
      throw new Error('Expected response format error')
    } catch (error) {
      expect(error).toMatchObject({ code: 'UnexpectedResponse' })
    }
  })
})

describe('BrowserSessionTeamCityTransport', () => {
  it('sends the artifact REST path to the extension service worker', async () => {
    const sendMessage = vi.fn().mockResolvedValue(response({
      bodyText: '{"file":[]}',
      transport: 'service-worker',
      attemptedTransports: ['service-worker', 'main-world'],
    }))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    const observer = {
      requestStarted: vi.fn(),
      responseReceived: vi.fn(),
      requestFailed: vi.fn(),
    }
    const transport = new BrowserSessionTeamCityTransport(observer)
    const path =
      '/app/rest/builds/id:700/artifacts?locator=recursive%3Atrue%2CbrowseArchives%3Atrue'

    await expect(transport.getJson(path, { timeoutMs: 15_000 })).resolves.toMatchObject({
      data: { file: [] },
      status: 200,
      transport: 'service-worker',
    })
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'teamcity:get',
      path,
      timeoutMs: 15_000,
    })
    expect(observer.requestStarted).toHaveBeenCalledWith({
      path,
      url: new URL(path, window.location.origin).toString(),
      timeoutMs: 15_000,
    })
    expect(observer.responseReceived).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ path }),
      response: expect.objectContaining({ status: 200, bodyText: '{"file":[]}' }),
      transportRoute: 'service-worker → main-world',
    }))
    expect(observer.requestFailed).not.toHaveBeenCalled()
  })
})
