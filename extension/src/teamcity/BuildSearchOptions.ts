import type { BuildSearchMode } from './BuildSearch'
import { createSuccessfulBuildsPath, type TeamCityBuild } from './BuildFinder'
import { TeamCityError } from './TeamCityError'

export const maximumVisibleBuildSearchOptions = 50
export const maximumBuildSearchConfigurationChunkSize = 20
export const maximumBuildSearchLocatorLength = 1_800

const keyedTaskPattern = /(?:^|[^\p{L}\p{N}])([\p{L}\p{N}]+-\d+)(?=$|[^\p{L}\p{N}])/iu
const numericTaskPattern = /(?:^|[/_-])(feature|bugfix|fix|task|hotfix|issue|ticket)[/_-]+(\d+)(?=$|[^\d])/iu

export function extractTaskIdentifier(branchName: string | undefined): string | undefined {
  const branch = branchName?.trim()
  if (branch === undefined || branch.length === 0) {
    return undefined
  }

  const keyedMatch = keyedTaskPattern.exec(branch)
  if (keyedMatch?.[1] !== undefined) {
    return keyedMatch[1]
  }

  const numericMatch = numericTaskPattern.exec(branch)
  return numericMatch?.[2]
}

export function chunkBuildSearchConfigurations(
  buildTypeIds: readonly string[],
): string[][] {
  const chunks: string[][] = []
  let currentChunk: string[] = []

  for (const buildTypeId of new Set(buildTypeIds)) {
    const singlePath = createSuccessfulBuildsPath(buildTypeId, 100)
    if (singlePath.length > maximumBuildSearchLocatorLength) {
      throw new TeamCityError(
        'InvalidRequest',
        'TeamCity build configuration identifier is too long.',
      )
    }

    const candidate = [...currentChunk, buildTypeId]
    const exceedsCount = candidate.length > maximumBuildSearchConfigurationChunkSize
    const exceedsLength = currentChunk.length > 0 &&
      createSuccessfulBuildsPath(candidate, 100).length > maximumBuildSearchLocatorLength
    if (exceedsCount || exceedsLength) {
      chunks.push(currentChunk)
      currentChunk = [buildTypeId]
    } else {
      currentChunk = candidate
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }
  return chunks
}

interface SearchOptionEntry {
  identityKey: string
  normalizedValue: string
  order: number
  value: string
}

interface ConfigurationSearchOptions {
  builds: Map<string, SearchOptionEntry>
  tasks: Map<string, SearchOptionEntry>
}

function emptyConfigurationOptions(): ConfigurationSearchOptions {
  return { builds: new Map(), tasks: new Map() }
}

export class ProjectBuildSearchIndex {
  private readonly configurations = new Map<string, ConfigurationSearchOptions>()
  private nextOrder = 0

  public replaceConfigurations(buildTypeIds: readonly string[]): void {
    for (const buildTypeId of buildTypeIds) {
      this.configurations.delete(buildTypeId)
    }
  }

  public addBuilds(builds: readonly TeamCityBuild[]): void {
    for (const build of builds) {
      let options = this.configurations.get(build.buildTypeId)
      if (options === undefined) {
        options = emptyConfigurationOptions()
        this.configurations.set(build.buildTypeId, options)
      }

      this.addOption(options.builds, build.number, false)
      const taskIdentifier = extractTaskIdentifier(build.branchName)
      if (taskIdentifier !== undefined) {
        this.addOption(options.tasks, taskIdentifier, true)
      }
    }
  }

  public values(
    mode: BuildSearchMode,
    buildTypeIds: readonly string[],
    query = '',
    limit = maximumVisibleBuildSearchOptions,
  ): string[] {
    const normalizedQuery = query.trim().toLowerCase()
    const entries: SearchOptionEntry[] = []
    for (const buildTypeId of buildTypeIds) {
      const options = this.configurations.get(buildTypeId)
      if (options !== undefined) {
        entries.push(...(mode === 'task' ? options.tasks : options.builds).values())
      }
    }
    entries.sort((left, right) => left.order - right.order)

    const result: string[] = []
    const seen = new Set<string>()
    for (const entry of entries) {
      if (
        !seen.has(entry.identityKey) &&
        (normalizedQuery.length === 0 || entry.normalizedValue.includes(normalizedQuery))
      ) {
        seen.add(entry.identityKey)
        result.push(entry.value)
        if (result.length >= limit) {
          break
        }
      }
    }
    return result
  }

  private addOption(
    options: Map<string, SearchOptionEntry>,
    value: string,
    ignoreCase: boolean,
  ): void {
    const key = ignoreCase ? value.toLowerCase() : value
    if (options.has(key)) {
      return
    }
    options.set(key, {
      identityKey: key,
      normalizedValue: value.toLowerCase(),
      order: this.nextOrder,
      value,
    })
    this.nextOrder += 1
  }
}

interface CacheEntry {
  index: ProjectBuildSearchIndex
  lastAccessedAt: number
  signature: string
}

export class BuildSearchOptionsCache {
  private readonly entries = new Map<string, CacheEntry>()

  private activeSessionScope?: string

  public constructor(
    private readonly maximumProjects = 3,
    private readonly idleTtlMs = 10 * 60 * 1_000,
  ) {}

  public getOrCreate(
    sessionScope: string,
    projectId: string,
    configurationSignature: string,
    now = Date.now(),
  ): ProjectBuildSearchIndex {
    this.removeExpired(now)
    const key = `${sessionScope}\u0000${projectId}`
    if (this.activeSessionScope !== undefined && this.activeSessionScope !== sessionScope) {
      this.entries.clear()
    }
    this.activeSessionScope = sessionScope

    const existing = this.entries.get(key)
    if (existing !== undefined && existing.signature === configurationSignature) {
      existing.lastAccessedAt = now
      return existing.index
    }

    const index = new ProjectBuildSearchIndex()
    this.entries.set(key, {
      index,
      lastAccessedAt: now,
      signature: configurationSignature,
    })
    this.evictLeastRecentlyUsed()
    return index
  }

  public prune(now = Date.now()): void {
    this.removeExpired(now)
  }

  public clear(): void {
    this.entries.clear()
    this.activeSessionScope = undefined
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastAccessedAt >= this.idleTtlMs) {
        this.entries.delete(key)
      }
    }
  }

  private evictLeastRecentlyUsed(): void {
    while (this.entries.size > this.maximumProjects) {
      let oldestKey: string | undefined
      let oldestAccess = Number.POSITIVE_INFINITY
      for (const [key, entry] of this.entries) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestKey = key
          oldestAccess = entry.lastAccessedAt
        }
      }
      if (oldestKey === undefined) {
        return
      }
      this.entries.delete(oldestKey)
    }
  }
}
