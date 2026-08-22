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
  transport: TeamCityTransportKind
}

export interface BuildArtifactSearchOptions {
  maximumBuilds?: number
  concurrency?: number
  query?: BuildSearchQuery
  timeoutMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
  onProgress?(result: BuildArtifactSearchResult): void
}

const defaultMaximumBuilds = 20
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
  deadline: number,
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
        timeoutMs: Math.max(1, deadline - Date.now()),
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
      transport: 'service-worker',
    }
  }

  const maximumBuilds = boundedInteger(options.maximumBuilds, defaultMaximumBuilds, 1, 20)
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
  const deadline = Date.now() + timeoutMs
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const buildResult = await service.loadBuilds([...uniqueConfigurations.keys()], {
      maximumBuilds,
      query: options.query,
      requestTimeoutMs,
      signal: controller.signal,
    })
    const builds = buildResult.builds
      .filter((build) => uniqueConfigurations.has(build.buildTypeId))
      .slice(0, maximumBuilds)
    const matches: Array<BuildArtifactMatch | undefined> = new Array(builds.length)
    let cursor = 0
    let completedResolutions = 0
    let failedResolutions = 0
    let ambiguousResolutions = 0
    let firstResolutionError: unknown

    const notifyProgress = () => {
      try {
        options.onProgress?.({
          matches: matches.filter((match) => match !== undefined),
          checkedBuilds: completedResolutions + failedResolutions,
          failedConfigurations: buildResult.failedConfigurations,
          failedBuilds: failedResolutions,
          ambiguousBuilds: ambiguousResolutions,
          transport: buildResult.transport,
        })
      } catch {
        // UI progress reporting must never affect the TeamCity search.
      }
    }

    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = cursor
        cursor += 1
        const build = builds[index]
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
            deadline,
            requestTimeoutMs,
          )
          if (controller.signal.aborted) {
            return
          }
          if (artifactResult.status === 'Resolved') {
            matches[index] = {
              build,
              configuration: {
                id: configuration.id,
                name: configuration.name,
                platform: artifactResult.platform,
              },
              artifact: artifactResult.artifact,
            }
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

    if (controller.signal.aborted) {
      throw new TeamCityError('RequestTimeout', 'TeamCity build artifact search timed out.')
    }
    if (completedResolutions === 0 && firstResolutionError !== undefined) {
      throw firstResolutionError
    }

    return {
      matches: matches.filter((match) => match !== undefined),
      checkedBuilds: builds.length,
      failedConfigurations: buildResult.failedConfigurations,
      failedBuilds: failedResolutions,
      ambiguousBuilds: ambiguousResolutions,
      transport: buildResult.transport,
    }
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
