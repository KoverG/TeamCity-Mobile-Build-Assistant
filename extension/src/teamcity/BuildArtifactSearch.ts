import type { ArtifactCandidate, MobilePlatform } from './ArtifactResolver'
import type { TeamCityBuild } from './BuildFinder'
import type { TeamCityService } from './TeamCityService'
import { TeamCityError } from './TeamCityError'
import type { TeamCityTransportKind } from './contracts'
import { boundedInteger } from './limits'

export interface BuildArtifactSearchConfiguration {
  id: string
  name: string
  platform: MobilePlatform
}

export interface BuildArtifactMatch {
  build: TeamCityBuild
  configuration: BuildArtifactSearchConfiguration
  artifact: ArtifactCandidate
}

export interface BuildArtifactSearchResult {
  matches: BuildArtifactMatch[]
  checkedBuilds: number
  transport: TeamCityTransportKind
}

export interface BuildArtifactSearchOptions {
  maximumBuilds?: number
  concurrency?: number
  timeoutMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
}

const defaultMaximumBuilds = 20
const defaultConcurrency = 4
const defaultTimeoutMs = 120_000
const defaultRequestTimeoutMs = 30_000

export async function searchBuildArtifacts(
  service: TeamCityService,
  configurations: readonly BuildArtifactSearchConfiguration[],
  options: BuildArtifactSearchOptions = {},
): Promise<BuildArtifactSearchResult> {
  const uniqueConfigurations = new Map(
    configurations.map((configuration) => [configuration.id, configuration]),
  )
  if (uniqueConfigurations.size === 0) {
    return { matches: [], checkedBuilds: 0, transport: 'service-worker' }
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
      requestTimeoutMs,
      signal: controller.signal,
    })
    const builds = buildResult.builds
      .filter((build) => uniqueConfigurations.has(build.buildTypeId))
      .slice(0, maximumBuilds)
    const matches: Array<BuildArtifactMatch | undefined> = new Array(builds.length)
    let cursor = 0
    let completedResolutions = 0
    let firstResolutionError: unknown

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
          const resolution = await service.resolveArtifact(
            build.id,
            build.buildTypeId,
            configuration.platform,
            {
              signal: controller.signal,
              timeoutMs: Math.max(1, deadline - Date.now()),
              requestTimeoutMs,
            },
          )
          if (resolution.status === 'Resolved' && resolution.candidates.length === 1) {
            matches[index] = {
              build,
              configuration,
              artifact: resolution.candidates[0],
            }
          }
          completedResolutions += 1
        } catch (error) {
          firstResolutionError ??= error
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
      transport: buildResult.transport,
    }
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
