import type { BuildSearchMode } from '../teamcity/BuildSearch'

export interface SearchHistory {
  task: string[]
  build: string[]
}

export interface SearchHistoryStorage {
  load(origin: string): Promise<SearchHistory>
  save(origin: string, history: SearchHistory): Promise<void>
}

const keyPrefix = 'tcba.search-history.v1:'
const maximumEntriesPerMode = 5

function storageKey(origin: string): string {
  const normalizedOrigin = new URL(origin).origin
  return `${keyPrefix}${encodeURIComponent(normalizedOrigin)}`
}

function parseEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, entries) => entries.indexOf(item) === index)
    .slice(0, maximumEntriesPerMode)
}

function parseHistory(value: unknown): SearchHistory {
  if (typeof value !== 'object' || value === null) {
    return { task: [], build: [] }
  }
  const history = value as Partial<SearchHistory>
  return {
    task: parseEntries(history.task),
    build: parseEntries(history.build),
  }
}

export function withRememberedQuery(
  history: SearchHistory,
  mode: BuildSearchMode,
  query: string,
): SearchHistory {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length === 0) {
    return history
  }
  return {
    ...history,
    [mode]: [
      normalizedQuery,
      ...history[mode].filter((item) => item !== normalizedQuery),
    ].slice(0, maximumEntriesPerMode),
  }
}

export class ChromeSearchHistoryStorage implements SearchHistoryStorage {
  public async load(origin: string): Promise<SearchHistory> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return { task: [], build: [] }
    }
    const key = storageKey(origin)
    const stored = await chrome.storage.local.get(key)
    return parseHistory(stored[key])
  }

  public async save(origin: string, history: SearchHistory): Promise<void> {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) {
      return
    }
    await chrome.storage.local.set({ [storageKey(origin)]: parseHistory(history) })
  }
}
