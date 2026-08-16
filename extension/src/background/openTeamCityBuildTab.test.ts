import { describe, expect, it, vi } from 'vitest'
import { openTeamCityBuildTab } from './openTeamCityBuildTab'

function createSender(url: string): chrome.runtime.MessageSender {
  return {
    tab: { windowId: 3, url } as chrome.tabs.Tab,
  }
}

describe('openTeamCityBuildTab', () => {
  it('opens a trusted build page in an inactive tab in the source window', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityBuildTab(
      '12345',
      createSender('https://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: true })
    expect(createTab).toHaveBeenCalledWith({
      url: 'https://teamcity.example.test/viewLog.html?buildId=12345',
      active: false,
      windowId: 3,
    })
  })

  it('rejects invalid build identifiers before opening a tab', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityBuildTab(
      '12345&unexpected=value',
      createSender('https://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: false, error: 'invalid-request' })
    expect(createTab).not.toHaveBeenCalled()
  })

  it('rejects a non-HTTPS source tab', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityBuildTab(
      '12345',
      createSender('http://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: false, error: 'invalid-request' })
    expect(createTab).not.toHaveBeenCalled()
  })
})
