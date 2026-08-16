import {
  resolveMobileArtifact,
  type ArtifactResolverOptions,
  type ArtifactResolution,
  type MobilePlatform,
} from './ArtifactResolver'
import {
  loadSuccessfulBuilds,
  type BuildLoadOptions,
  type BuildsResult,
} from './BuildFinder'
import { loadBuildConfigurations, type CatalogResult } from './CatalogLoader'
import { probeSession } from './SessionProbe'
import {
  BrowserSessionTeamCityTransport,
  type TeamCityHttpClient,
} from './TeamCityTransport'

const buildConfigurationConcurrency = 4

export interface TeamCityService {
  loadCatalog(): Promise<CatalogResult>
  loadBuilds(
    buildTypeIds: readonly string[],
    options?: BuildLoadOptions,
  ): Promise<BuildsResult>
  resolveArtifact(
    buildId: string,
    buildTypeId: string,
    platform: MobilePlatform,
    options?: Omit<ArtifactResolverOptions, 'buildTypeId'>,
  ): Promise<ArtifactResolution>
}

export function createTeamCityService(
  client: TeamCityHttpClient = new BrowserSessionTeamCityTransport(),
): TeamCityService {
  return {
    async loadCatalog() {
      await probeSession(client)
      return loadBuildConfigurations(client)
    },
    async loadBuilds(buildTypeIds, options) {
      const uniqueBuildTypeIds = [...new Set(buildTypeIds)]
      const results: Array<BuildsResult | undefined> = new Array(uniqueBuildTypeIds.length)
      let cursor = 0
      const worker = async () => {
        while (cursor < uniqueBuildTypeIds.length) {
          const index = cursor
          cursor += 1
          const buildTypeId = uniqueBuildTypeIds[index]
          if (buildTypeId !== undefined) {
            results[index] = await loadSuccessfulBuilds(client, buildTypeId, options)
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(buildConfigurationConcurrency, uniqueBuildTypeIds.length) },
          () => worker(),
        ),
      )
      const completedResults = results.filter((result) => result !== undefined)
      const builds = new Map(
        completedResults.flatMap((result) => result.builds).map((build) => [build.id, build]),
      )
      return {
        builds: [...builds.values()].sort((left, right) =>
          (right.finishDate ?? '').localeCompare(left.finishDate ?? ''),
        ),
        transport: completedResults.at(-1)?.transport ?? 'service-worker',
      }
    },
    resolveArtifact(buildId, buildTypeId, platform, options) {
      return resolveMobileArtifact(client, buildId, platform, {
        ...options,
        buildTypeId,
      })
    },
  }
}

export type { ArtifactResolution, BuildsResult, CatalogResult, MobilePlatform }
