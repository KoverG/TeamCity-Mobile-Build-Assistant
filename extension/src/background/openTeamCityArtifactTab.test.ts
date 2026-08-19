import { describe, expect, it, vi } from 'vitest'
import { openTeamCityArtifactTab } from './openTeamCityArtifactTab'

function createSender(url: string): chrome.runtime.MessageSender {
  return {
    tab: { windowId: 3, url } as chrome.tabs.Tab,
  }
}

describe('openTeamCityArtifactTab', () => {
  it('opens the exact trusted artifact URL in an inactive tab in the source window', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityArtifactTab(
      '/downloadBuild.html?buildId=12345',
      createSender('https://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: true })
    expect(createTab).toHaveBeenCalledWith({
      url: 'https://teamcity.example.test/downloadBuild.html?buildId=12345',
      active: false,
      windowId: 3,
    })
  })

  it('rejects a cross-origin artifact URL', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityArtifactTab(
      'https://other.example.test/downloadBuild.html?buildId=12345',
      createSender('https://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: false, error: 'invalid-request' })
    expect(createTab).not.toHaveBeenCalled()
  })

  it('rejects a non-HTTPS source tab', async () => {
    const createTab = vi.fn().mockResolvedValue({})

    const response = await openTeamCityArtifactTab(
      '/downloadBuild.html?buildId=12345',
      createSender('http://teamcity.example.test/project.html'),
      createTab,
    )

    expect(response).toEqual({ ok: false, error: 'invalid-request' })
    expect(createTab).not.toHaveBeenCalled()
  })
})
