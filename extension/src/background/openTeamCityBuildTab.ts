import type { OpenTeamCityBuildResponse } from '../teamcity/contracts'
import { createTeamCityBuildPageUrl } from '../teamcity/restPath'

type CreateTab = (properties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>

export async function openTeamCityBuildTab(
  buildId: string,
  sender: chrome.runtime.MessageSender,
  createTab: CreateTab = (properties) => chrome.tabs.create(properties),
): Promise<OpenTeamCityBuildResponse> {
  const sourceTab = sender.tab

  if (sourceTab?.url === undefined || sourceTab.windowId === undefined) {
    return { ok: false, error: 'tab-unavailable' }
  }

  let buildUrl: string

  try {
    const sourceUrl = new URL(sourceTab.url)
    if (sourceUrl.protocol !== 'https:') {
      return { ok: false, error: 'invalid-request' }
    }
    buildUrl = createTeamCityBuildPageUrl(buildId, sourceUrl.origin)
  } catch {
    return { ok: false, error: 'invalid-request' }
  }

  try {
    await createTab({
      url: buildUrl,
      active: false,
      windowId: sourceTab.windowId,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'open-failed' }
  }
}
