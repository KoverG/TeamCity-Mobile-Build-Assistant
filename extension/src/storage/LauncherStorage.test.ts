import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChromeLauncherStorage } from './LauncherStorage'

const values: Record<string, unknown> = {}

beforeEach(() => {
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(values, items)),
      },
    },
  })
})

describe('ChromeLauncherStorage', () => {
  it('isolates launcher preferences by runtime TeamCity origin', async () => {
    const storage = new ChromeLauncherStorage()
    const first = { positionRatio: 0.25, collapsed: false, side: 'left' as const }
    const second = { positionRatio: 0.75, collapsed: true, side: 'right' as const }

    await storage.save('https://one.example.test/path', first)
    await storage.save('https://two.example.test/other', second)

    await expect(storage.load('https://one.example.test')).resolves.toEqual(first)
    await expect(storage.load('https://two.example.test')).resolves.toEqual(second)
  })

  it('ignores malformed or out-of-range preferences', async () => {
    const storage = new ChromeLauncherStorage()
    await chrome.storage.local.set({
      'tcba.launcher.v1:https%3A%2F%2Fteamcity.example.test': {
        positionRatio: 1.5,
        collapsed: 'yes',
        side: 'top',
      },
    })

    await expect(storage.load('https://teamcity.example.test')).resolves.toBeUndefined()
  })

  it('keeps stored preferences from before side selection was introduced', async () => {
    await chrome.storage.local.set({
      'tcba.launcher.v1:https%3A%2F%2Fteamcity.example.test': {
        positionRatio: 0.4,
        collapsed: false,
      },
    })

    await expect(new ChromeLauncherStorage().load('https://teamcity.example.test')).resolves.toEqual({
      positionRatio: 0.4,
      collapsed: false,
      side: 'left',
    })
  })
})
