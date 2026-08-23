import { describe, expect, it, vi } from 'vitest'
import type { ArtifactResolution } from '../../src/teamcity/ArtifactResolver'
import {
  searchBuildArtifacts,
  type BuildArtifactSearchConfiguration,
  type BuildArtifactSearchResult,
} from '../../src/teamcity/BuildArtifactSearch'
import type { TeamCityBuild } from '../../src/teamcity/BuildFinder'
import type { TeamCityService } from '../../src/teamcity/TeamCityService'

function build(index: number): TeamCityBuild {
  return {
    id: String(index),
    buildTypeId: index % 2 === 0 ? 'Synthetic_Android' : 'Synthetic_iOS',
    number: String(1_000 + index),
    branchName: `feature/synthetic-${index}`,
    defaultBranch: false,
    finishDate: `202608${String(30 - index).padStart(2, '0')}T101500+0000`,
  }
}

function resolution(index: number): ArtifactResolution {
  return index % 2 === 0
    ? {
        status: 'Resolved',
        candidates: [
          {
            name: `synthetic-${index}.apk`,
            fullName: `artifacts/synthetic-${index}.apk`,
            contentHref: `/repository/download/synthetic/${index}.apk`,
            size: 128 * 1024 * 1024,
          },
        ],
        transport: 'main-world',
        diagnostics: {
          strategy: 'bulk',
          requestCount: 1,
          visitedNodes: 1,
          bulkExpandedArchives: false,
        },
      }
    : {
        status: 'NotFound',
        candidates: [],
        transport: 'main-world',
        diagnostics: {
          strategy: 'bulk',
          requestCount: 1,
          visitedNodes: 0,
          bulkExpandedArchives: false,
        },
      }
}

describe('searchBuildArtifacts', () => {
  it('checks every page with bounded artifact concurrency and publishes results immediately', async () => {
    const builds = Array.from({ length: 25 }, (_, index) => build(index))
    let activeResolutions = 0
    let maximumConcurrency = 0
    const resolveArtifact = vi.fn(async (buildId: string) => {
      activeResolutions += 1
      maximumConcurrency = Math.max(maximumConcurrency, activeResolutions)
      await new Promise((resolve) => window.setTimeout(resolve, 2))
      activeResolutions -= 1
      return resolution(Number(buildId))
    })
    const loadBuilds = vi.fn(async (
      _buildTypeIds: readonly string[],
      options?: Parameters<TeamCityService['loadBuilds']>[1],
    ) => {
      await options?.onPage?.({
        builds: builds.slice(0, 20),
        transport: 'main-world',
      })
      expect(resolveArtifact).toHaveBeenCalledTimes(20)
      await options?.onPage?.({
        builds: builds.slice(20),
        transport: 'main-world',
      })
      return {
        builds,
        failedConfigurations: 0,
        transport: 'main-world' as const,
      }
    })
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds,
      resolveArtifact,
    }
    const configurations: BuildArtifactSearchConfiguration[] = [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
      { id: 'Synthetic_iOS', name: 'iOS', platform: 'ios' },
    ]
    const progressCounts: number[] = []

    const result = await searchBuildArtifacts(service, configurations, {
      pageSize: 50,
      concurrency: 8,
      query: { mode: 'task', value: 'synthetic-1' },
      onProgress: (progress) => progressCounts.push(progress.checkedBuilds),
    })

    expect(result.checkedBuilds).toBe(25)
    expect(result.failedConfigurations).toBe(0)
    expect(result.failedBuilds).toBe(0)
    expect(result.ambiguousBuilds).toBe(0)
    expect(result.failedBuildPages).toBe(0)
    expect(result.matches).toHaveLength(13)
    expect(result.matches.every(({ artifact }) => artifact.size === 128 * 1024 * 1024)).toBe(true)
    expect(resolveArtifact).toHaveBeenCalledTimes(25)
    expect(loadBuilds).toHaveBeenCalledWith(
      ['Synthetic_Android', 'Synthetic_iOS'],
      expect.objectContaining({
        pageSize: 50,
        maximumPages: 1_000,
        query: { mode: 'task', value: 'synthetic-1' },
      }),
    )
    expect(progressCounts).toContain(20)
    expect(progressCounts.at(-1)).toBe(25)
    expect(maximumConcurrency).toBeLessThanOrEqual(4)
  })

  it('does not call TeamCity when no searchable configurations are available', async () => {
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn(),
      resolveArtifact: vi.fn(),
    }

    await expect(searchBuildArtifacts(service, [])).resolves.toEqual({
      matches: [],
      checkedBuilds: 0,
      failedConfigurations: 0,
      failedBuilds: 0,
      ambiguousBuilds: 0,
      failedBuildPages: 0,
      transport: 'service-worker',
    })
    expect(service.loadBuilds).not.toHaveBeenCalled()
  })

  it('omits an individual failed build when other builds were checked successfully', async () => {
    const builds = [build(0), build(1), build(2)]
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds,
        failedConfigurations: 0,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn(async (buildId: string) => {
        if (buildId === '0') {
          throw new Error('Synthetic per-build failure.')
        }
        return resolution(Number(buildId))
      }),
    }

    const result = await searchBuildArtifacts(service, [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
      { id: 'Synthetic_iOS', name: 'iOS', platform: 'ios' },
    ])

    expect(result.matches.map(({ build: item }) => item.id)).toEqual(['2'])
    expect(result.checkedBuilds).toBe(3)
    expect(result.failedBuilds).toBe(1)
    expect(result.ambiguousBuilds).toBe(0)
  })

  it('keeps published matches when TeamCity fails to load the next page', async () => {
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn(async (
        _buildTypeIds: readonly string[],
        options?: Parameters<TeamCityService['loadBuilds']>[1],
      ) => {
        await options?.onPage?.({
          builds: [build(0)],
          transport: 'main-world',
        })
        throw new Error('Synthetic next page failure.')
      }),
      resolveArtifact: vi.fn(async (buildId: string) => resolution(Number(buildId))),
    }

    const result = await searchBuildArtifacts(service, [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
    ])

    expect(result.matches.map(({ build: item }) => item.id)).toEqual(['0'])
    expect(result.checkedBuilds).toBe(1)
    expect(result.failedBuildPages).toBe(1)
  })

  it('preserves matches and reports failed build configurations', async () => {
    const builds = [build(0)]
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds,
        failedConfigurations: 1,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn(async (buildId: string) => resolution(Number(buildId))),
    }

    const result = await searchBuildArtifacts(service, [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
      { id: 'Synthetic_iOS', name: 'iOS', platform: 'ios' },
    ])

    expect(result.matches.map(({ build: item }) => item.id)).toEqual(['0'])
    expect(result.checkedBuilds).toBe(1)
    expect(result.failedConfigurations).toBe(1)
    expect(result.failedBuilds).toBe(0)
  })

  it('detects APK and IPA platforms for other configurations without exceeding concurrency', async () => {
    const builds: TeamCityBuild[] = [
      { ...build(0), id: 'other-android', buildTypeId: 'Synthetic_Other' },
      { ...build(1), id: 'other-ios', buildTypeId: 'Synthetic_Other' },
    ]
    let activeResolutions = 0
    let maximumConcurrency = 0
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds,
        failedConfigurations: 0,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn(async (buildId: string, _buildTypeId: string, platform): Promise<ArtifactResolution> => {
        activeResolutions += 1
        maximumConcurrency = Math.max(maximumConcurrency, activeResolutions)
        await new Promise((resolve) => window.setTimeout(resolve, 2))
        activeResolutions -= 1
        const expectedPlatform = buildId === 'other-android' ? 'android' : 'ios'
        if (platform !== expectedPlatform) {
          return resolution(1)
        }
        const extension = platform === 'android' ? 'apk' : 'ipa'
        return {
          status: 'Resolved',
          candidates: [{
            name: `synthetic.${extension}`,
            fullName: `artifacts/synthetic.${extension}`,
            contentHref: `/repository/download/synthetic.${extension}`,
          }],
          transport: 'main-world',
          diagnostics: {
            strategy: 'bulk',
            requestCount: 1,
            visitedNodes: 1,
            bulkExpandedArchives: false,
          },
        }
      }),
    }

    const result = await searchBuildArtifacts(service, [
      { id: 'Synthetic_Other', name: 'Other', platform: 'other' },
    ])

    expect(result.matches.map(({ configuration }) => configuration.platform))
      .toEqual(['android', 'ios'])
    expect(result.failedBuilds).toBe(0)
    expect(result.ambiguousBuilds).toBe(0)
    expect(service.resolveArtifact).toHaveBeenCalledTimes(4)
    expect(maximumConcurrency).toBeLessThanOrEqual(4)
  })

  it('does not guess a platform when other configurations are ambiguous or empty', async () => {
    const builds: TeamCityBuild[] = [
      { ...build(0), id: 'other-ambiguous', buildTypeId: 'Synthetic_Other' },
      { ...build(1), id: 'other-empty', buildTypeId: 'Synthetic_Other' },
    ]
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds,
        failedConfigurations: 0,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn(async (buildId: string, _buildTypeId: string, platform): Promise<ArtifactResolution> => {
        if (buildId === 'other-empty') {
          return resolution(1)
        }
        const extension = platform === 'android' ? 'apk' : 'ipa'
        return {
          status: 'Resolved',
          candidates: [{
            name: `synthetic.${extension}`,
            fullName: `artifacts/synthetic.${extension}`,
            contentHref: `/repository/download/synthetic.${extension}`,
          }],
          transport: 'main-world',
          diagnostics: {
            strategy: 'bulk',
            requestCount: 1,
            visitedNodes: 1,
            bulkExpandedArchives: false,
          },
        }
      }),
    }

    const result = await searchBuildArtifacts(service, [
      { id: 'Synthetic_Other', name: 'Other', platform: 'other' },
    ])

    expect(result.matches).toEqual([])
    expect(result.checkedBuilds).toBe(2)
    expect(result.failedBuilds).toBe(0)
    expect(result.ambiguousBuilds).toBe(1)
  })

  it('publishes completed matches before a caller stops the search', async () => {
    const controller = new AbortController()
    const onProgress = vi.fn((progress: BuildArtifactSearchResult) => {
      if (progress.checkedBuilds === 1) {
        controller.abort()
      }
    })
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds: [build(0), build(2)],
        failedConfigurations: 0,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn(async (buildId: string) => resolution(Number(buildId))),
    }

    const search = searchBuildArtifacts(
      service,
      [{ id: 'Synthetic_Android', name: 'Android', platform: 'android' }],
      {
        concurrency: 1,
        signal: controller.signal,
        onProgress,
      },
    )

    await expect(search).rejects.toMatchObject({ code: 'RequestTimeout' })
    expect(onProgress).toHaveBeenCalledTimes(1)
    const firstProgress = onProgress.mock.calls[0]?.[0]
    expect(firstProgress?.checkedBuilds).toBe(1)
    expect(firstProgress?.matches.map(({ build: item }) => item.id)).toEqual(['0'])
    expect(service.resolveArtifact).toHaveBeenCalledTimes(1)
  })

  it('fails the search when every build artifact check fails', async () => {
    const builds = [build(0), build(1)]
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({
        builds,
        failedConfigurations: 0,
        transport: 'main-world',
      }),
      resolveArtifact: vi.fn().mockRejectedValue(new Error('Synthetic total failure.')),
    }

    const search = searchBuildArtifacts(service, [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
      { id: 'Synthetic_iOS', name: 'iOS', platform: 'ios' },
    ])

    await expect(search).rejects.toThrow('Synthetic total failure.')
  })
})
