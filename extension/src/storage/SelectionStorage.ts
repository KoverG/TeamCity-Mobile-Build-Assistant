import type {
  MobileEnvironment,
  MobileOperatingSystem,
} from '../teamcity/BuildConfigurationClassifier'

export interface RememberedSelection {
  projectId: string
  os: MobileOperatingSystem
  environment: MobileEnvironment
}

export interface SelectionStorage {
  load(origin: string): Promise<RememberedSelection | undefined>
  save(origin: string, selection: RememberedSelection): Promise<void>
  clear(origin: string): Promise<void>
}

const keyPrefix = 'tcba.selection.v1:'

function storageKey(origin: string): string {
  const normalizedOrigin = new URL(origin).origin
  return `${keyPrefix}${encodeURIComponent(normalizedOrigin)}`
}

function isRememberedSelection(value: unknown): value is RememberedSelection {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const selection = value as Partial<RememberedSelection>
  return (
    typeof selection.projectId === 'string' &&
    (selection.os === 'Android' || selection.os === 'iOS' || selection.os === 'Unclassified') &&
    (selection.environment === 'Development' ||
      selection.environment === 'Staging' ||
      selection.environment === 'Preview' ||
      selection.environment === 'PreProduction' ||
      selection.environment === 'Production' ||
      selection.environment === 'Unclassified')
  )
}

export class ChromeSelectionStorage implements SelectionStorage {
  public async load(origin: string): Promise<RememberedSelection | undefined> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return undefined
    }
    const key = storageKey(origin)
    const stored = await chrome.storage.local.get(key)
    return isRememberedSelection(stored[key]) ? stored[key] : undefined
  }

  public async save(origin: string, selection: RememberedSelection): Promise<void> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return
    }
    await chrome.storage.local.set({ [storageKey(origin)]: selection })
  }

  public async clear(origin: string): Promise<void> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return
    }
    await chrome.storage.local.remove(storageKey(origin))
  }
}
