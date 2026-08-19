import type { OpenTeamCityArtifactResponse } from '../teamcity/contracts'
import { toTrustedTeamCityUrl } from '../teamcity/restPath'

type CreateTab = (properties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>

export async function openTeamCityArtifactTab(
  contentHref: string,
  sender: chrome.runtime.MessageSender,
  createTab: CreateTab = (properties) => chrome.tabs.create(properties),
): Promise<OpenTeamCityArtifactResponse> {
  const sourceTab = sender.tab

  if (sourceTab?.url === undefined || sourceTab.windowId === undefined) {
    return { ok: false, error: 'tab-unavailable' }
  }

  let artifactUrl: string

  try {
    const sourceUrl = new URL(sourceTab.url)
    if (sourceUrl.protocol !== 'https:') {
      return { ok: false, error: 'invalid-request' }
    }
    artifactUrl = toTrustedTeamCityUrl(contentHref, sourceUrl.origin)
  } catch {
    return { ok: false, error: 'invalid-request' }
  }

  try {
    await createTab({
      url: artifactUrl,
      active: false,
      windowId: sourceTab.windowId,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'open-failed' }
  }
}
