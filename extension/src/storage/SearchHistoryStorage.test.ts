import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChromeSearchHistoryStorage,
  withRememberedQuery,
} from './SearchHistoryStorage'

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

describe('ChromeSearchHistoryStorage', () => {
  it('isolates histories by origin and mode', async () => {
    const storage = new ChromeSearchHistoryStorage()
    await storage.save('https://one.example.test/path', {
      task: ['TASK-123'],
      build: ['42'],
    })
    await storage.save('https://two.example.test/path', {
      task: ['TASK-456'],
      build: [],
    })

    await expect(storage.load('https://one.example.test')).resolves.toEqual({
      task: ['TASK-123'],
      build: ['42'],
    })
    await expect(storage.load('https://two.example.test')).resolves.toEqual({
      task: ['TASK-456'],
      build: [],
    })
  })

  it('deduplicates newest queries and keeps at most five entries', () => {
    const initial = {
      task: ['TASK-5', 'TASK-4', 'TASK-3', 'TASK-2', 'TASK-1'],
      build: [],
    }

    const moved = withRememberedQuery(initial, 'task', 'TASK-3')
    const added = withRememberedQuery(moved, 'task', 'TASK-6')

    expect(moved.task).toEqual(['TASK-3', 'TASK-5', 'TASK-4', 'TASK-2', 'TASK-1'])
    expect(added.task).toEqual(['TASK-6', 'TASK-3', 'TASK-5', 'TASK-4', 'TASK-2'])
  })

  it('ignores malformed stored values', async () => {
    const storage = new ChromeSearchHistoryStorage()
    await chrome.storage.local.set({
      'tcba.search-history.v1:https%3A%2F%2Fteamcity.example.test': {
        task: ['TASK-123', 42, '', 'TASK-123'],
        build: 'invalid',
      },
    })

    await expect(storage.load('https://teamcity.example.test')).resolves.toEqual({
      task: ['TASK-123'],
      build: [],
    })
  })
})
