export interface LegacySelectionCleanup {
  clear(origin: string): Promise<void>
}

const keyPrefix = 'tcba.selection.v1:'

function storageKey(origin: string): string {
  const normalizedOrigin = new URL(origin).origin
  return `${keyPrefix}${encodeURIComponent(normalizedOrigin)}`
}

export class ChromeLegacySelectionCleanup implements LegacySelectionCleanup {
  public async clear(origin: string): Promise<void> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return
    }
    await chrome.storage.local.remove(storageKey(origin))
  }
}
