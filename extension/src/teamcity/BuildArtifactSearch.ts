import type { ArtifactCandidate, MobilePlatform } from './ArtifactResolver'
import type { TeamCityBuild } from './BuildFinder'
import type { TeamCityService } from './TeamCityService'
import { TeamCityError } from './TeamCityError'
import type { TeamCityTransportKind } from './contracts'
import { boundedInteger } from './limits'
import type { BuildSearchQuery } from './BuildSearch'

export interface BuildArtifactSearchConfiguration {
  id: string
  name: string
  platform: MobilePlatform | 'other'
}

export interface ResolvedBuildArtifactSearchConfiguration
  extends Omit<BuildArtifactSearchConfiguration, 'platform'> {
  platform: MobilePlatform
}

export interface BuildArtifactMatch {
  build: TeamCityBuild
  configuration: ResolvedBuildArtifactSearchConfiguration
  artifact: ArtifactCandidate
}

export interface BuildArtifactSearchResult {
  matches: BuildArtifactMatch[]
  checkedBuilds: number
  failedConfigurations: number
  failedBuilds: number
  ambiguousBuilds: number
  failedBuildPages: number
  transport: TeamCityTransportKind
}

export interface BuildArtifactSearchOptions {
  pageSize?: number
  maximumPages?: number
  concurrency?: number
  query?: BuildSearchQuery
  timeoutMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
  onProgress?(result: BuildArtifactSearchResult): void
}

const defaultPageSize = 50
const defaultMaximumPages = 1_000
const defaultConcurrency = 4
const defaultTimeoutMs = 120_000
const defaultRequestTimeoutMs = 30_000
type ConfigurationArtifactResult =
  | { status: 'Resolved'; artifact: ArtifactCandidate; platform: MobilePlatform }
  | { status: 'NotFound' | 'Ambiguous' }

async function resolveConfigurationArtifact(
  service: TeamCityService,
  build: TeamCityBuild,
  configuration: BuildArtifactSearchConfiguration,
  signal: AbortSignal,
  timeoutMs: number,
  requestTimeoutMs: number,
): Promise<ConfigurationArtifactResult> {
  const platforms: readonly MobilePlatform[] = configuration.platform === 'other'
    ? ['android', 'ios']
    : [configuration.platform]
  const resolved: Array<{ artifact: ArtifactCandidate; platform: MobilePlatform }> = []

  for (const platform of platforms) {
    const resolution = await service.resolveArtifact(
      build.id,
      build.buildTypeId,
      platform,
      {
        signal,
        timeoutMs,
        requestTimeoutMs,
      },
    )
    if (resolution.status === 'Ambiguous') {
      return { status: 'Ambiguous' }
    }
    if (resolution.status === 'Resolved' && resolution.candidates.length === 1) {
      resolved.push({ artifact: resolution.candidates[0], platform })
    }
  }

  if (resolved.length === 0) {
    return { status: 'NotFound' }
  }
  if (resolved.length === 1) {
    return { status: 'Resolved', ...resolved[0] }
  }
  return { status: 'Ambiguous' }
}

export async function searchBuildArtifacts(
  service: TeamCityService,
  configurations: readonly BuildArtifactSearchConfiguration[],
  options: BuildArtifactSearchOptions = {},
): Promise<BuildArtifactSearchResult> {
  const uniqueConfigurations = new Map(
    configurations.map((configuration) => [configuration.id, configuration]),
  )
  if (uniqueConfigurations.size === 0) {
    return {
      matches: [],
      checkedBuilds: 0,
      failedConfigurations: 0,
      failedBuilds: 0,
      ambiguousBuilds: 0,
      failedBuildPages: 0,
      transport: 'service-worker',
    }
  }

  const pageSize = boundedInteger(options.pageSize, defaultPageSize, 1, 100)
  const maximumPages = boundedInteger(
    options.maximumPages,
    defaultMaximumPages,
    1,
    defaultMaximumPages,
  )
  const concurrency = boundedInteger(options.concurrency, defaultConcurrency, 1, 4)
  const timeoutMs = boundedInteger(options.timeoutMs, defaultTimeoutMs, 1, defaultTimeoutMs)
  const requestTimeoutMs = boundedInteger(
    options.requestTimeoutMs,
    defaultRequestTimeoutMs,
    1,
    defaultRequestTimeoutMs,
  )
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (options.signal?.aborted) {
    controller.abort()
  }

  try {
    const orderedBuildIds: string[] = []
    const processedBuildIds = new Set<string>()
    const matches = new Map<string, BuildArtifactMatch>()
    let completedResolutions = 0
    let failedResolutions = 0
    let ambiguousResolutions = 0
    let failedBuildPages = 0
    let firstResolutionError: unknown
    let transport: TeamCityTransportKind = 'service-worker'

    const currentMatches = () => orderedBuildIds.flatMap((id) => {
      const match = matches.get(id)
      return match === undefined ? [] : [match]
    })

    const notifyProgress = () => {
      try {
        options.onProgress?.({
          matches: currentMatches(),
          checkedBuilds: completedResolutions + failedResolutions,
          failedConfigurations: 0,
          failedBuilds: failedResolutions,
          ambiguousBuilds: ambiguousResolutions,
          failedBuildPages,
          transport,
        })
      } catch {
        // UI progress reporting must never affect the TeamCity search.
      }
    }

    const processBuildPage = async (pageBuilds: readonly TeamCityBuild[]) => {
      const builds = pageBuilds.filter((build) => {
        if (!uniqueConfigurations.has(build.buildTypeId) || processedBuildIds.has(build.id)) {
          return false
        }
        processedBuildIds.add(build.id)
        orderedBuildIds.push(build.id)
        return true
      })
      let cursor = 0
      const worker = async () => {
        while (!controller.signal.aborted) {
          const build = builds[cursor]
          cursor += 1
          if (build === undefined) {
            return
          }
          const configuration = uniqueConfigurations.get(build.buildTypeId)
          if (configuration === undefined) {
            continue
          }

          try {
            const artifactResult = await resolveConfigurationArtifact(
              service,
              build,
              configuration,
              controller.signal,
              timeoutMs,
              requestTimeoutMs,
            )
            if (controller.signal.aborted) {
              return
            }
            if (artifactResult.status === 'Resolved') {
              matches.set(build.id, {
                build,
                configuration: {
                  id: configuration.id,
                  name: configuration.name,
                  platform: artifactResult.platform,
                },
                artifact: artifactResult.artifact,
              })
            } else if (artifactResult.status === 'Ambiguous') {
              ambiguousResolutions += 1
            }
            completedResolutions += 1
            notifyProgress()
          } catch (error) {
            if (controller.signal.aborted) {
              return
            }
            failedResolutions += 1
            firstResolutionError ??= error
            notifyProgress()
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, builds.length) }, () => worker()),
      )
    }

    let buildResult
    try {
      buildResult = await service.loadBuilds([...uniqueConfigurations.keys()], {
        pageSize,
        maximumPages,
        query: options.query,
        requestTimeoutMs,
        signal: controller.signal,
        onPage: async (page) => {
          transport = page.transport
          await processBuildPage(page.builds)
        },
      })
      transport = buildResult.transport
      await processBuildPage(buildResult.builds)
    } catch (error) {
      if (controller.signal.aborted || completedResolutions + failedResolutions === 0) {
        throw error
      }
      failedBuildPages = 1
      notifyProgress()
    }

    if (controller.signal.aborted) {
      throw new TeamCityError('RequestTimeout', 'TeamCity build artifact search was stopped.')
    }
    if (completedResolutions === 0 && firstResolutionError !== undefined) {
      throw firstResolutionError
    }

    return {
      matches: currentMatches(),
      checkedBuilds: completedResolutions + failedResolutions,
      failedConfigurations: buildResult?.failedConfigurations ?? 0,
      failedBuilds: failedResolutions,
      ambiguousBuilds: ambiguousResolutions,
      failedBuildPages,
      transport,
    }
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
