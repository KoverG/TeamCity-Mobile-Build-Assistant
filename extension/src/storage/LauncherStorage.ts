export type LauncherSide = 'left' | 'right'

export interface LauncherPreferences {
  positionRatio: number
  collapsed: boolean
  side: LauncherSide
}

export interface LauncherStorage {
  load(origin: string): Promise<LauncherPreferences | undefined>
  save(origin: string, preferences: LauncherPreferences): Promise<void>
}

const keyPrefix = 'tcba.launcher.v1:'

function storageKey(origin: string): string {
  const normalizedOrigin = new URL(origin).origin
  return `${keyPrefix}${encodeURIComponent(normalizedOrigin)}`
}

function parseLauncherPreferences(value: unknown): LauncherPreferences | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const preferences = value as Partial<LauncherPreferences>
  const { positionRatio, collapsed, side } = preferences
  const basePreferencesValid = (
    typeof positionRatio === 'number'
    && Number.isFinite(positionRatio)
    && positionRatio >= 0
    && positionRatio <= 1
    && typeof collapsed === 'boolean'
  )
  const sideValid = (
    side === undefined
    || side === 'left'
    || side === 'right'
  )
  if (!basePreferencesValid || !sideValid) {
    return undefined
  }

  return {
    positionRatio: positionRatio as number,
    collapsed: collapsed as boolean,
    side: side ?? 'left',
  }
}

export class ChromeLauncherStorage implements LauncherStorage {
  public async load(origin: string): Promise<LauncherPreferences | undefined> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return undefined
    }

    const key = storageKey(origin)
    const stored = await chrome.storage.local.get(key)
    return parseLauncherPreferences(stored[key])
  }

  public async save(origin: string, preferences: LauncherPreferences): Promise<void> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return
    }

    await chrome.storage.local.set({ [storageKey(origin)]: preferences })
  }
}
