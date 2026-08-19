import { describe, expect, it, vi } from 'vitest'
import type { ArtifactResolution } from './ArtifactResolver'
import {
  searchBuildArtifacts,
  type BuildArtifactSearchConfiguration,
} from './BuildArtifactSearch'
import type { TeamCityBuild } from './BuildFinder'
import type { TeamCityService } from './TeamCityService'

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
  it('checks at most 20 builds with bounded artifact concurrency and keeps only resolved matches', async () => {
    const builds = Array.from({ length: 25 }, (_, index) => build(index))
    let activeResolutions = 0
    let maximumConcurrency = 0
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({ builds, transport: 'main-world' }),
      resolveArtifact: vi.fn(async (buildId: string) => {
        activeResolutions += 1
        maximumConcurrency = Math.max(maximumConcurrency, activeResolutions)
        await new Promise((resolve) => window.setTimeout(resolve, 2))
        activeResolutions -= 1
        return resolution(Number(buildId))
      }),
    }
    const configurations: BuildArtifactSearchConfiguration[] = [
      { id: 'Synthetic_Android', name: 'Android', platform: 'android' },
      { id: 'Synthetic_iOS', name: 'iOS', platform: 'ios' },
    ]

    const result = await searchBuildArtifacts(service, configurations, {
      maximumBuilds: 50,
      concurrency: 8,
      query: { mode: 'task', value: 'synthetic-1' },
    })

    expect(result.checkedBuilds).toBe(20)
    expect(result.matches).toHaveLength(10)
    expect(result.matches.every(({ artifact }) => artifact.size === 128 * 1024 * 1024)).toBe(true)
    expect(service.resolveArtifact).toHaveBeenCalledTimes(20)
    expect(service.loadBuilds).toHaveBeenCalledWith(
      ['Synthetic_Android', 'Synthetic_iOS'],
      expect.objectContaining({
        maximumBuilds: 20,
        query: { mode: 'task', value: 'synthetic-1' },
      }),
    )
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
      transport: 'service-worker',
    })
    expect(service.loadBuilds).not.toHaveBeenCalled()
  })

  it('omits an individual failed build when other builds were checked successfully', async () => {
    const builds = [build(0), build(1), build(2)]
    const service: TeamCityService = {
      loadCatalog: vi.fn(),
      loadBuilds: vi.fn().mockResolvedValue({ builds, transport: 'main-world' }),
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
  })
})
