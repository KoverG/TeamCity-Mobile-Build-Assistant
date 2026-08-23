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

export interface LoadedBuildsResult extends BuildsResult {
  failedConfigurations: number
}

export interface TeamCityService {
  loadCatalog(): Promise<CatalogResult>
  loadBuilds(
    buildTypeIds: readonly string[],
    options?: BuildLoadOptions,
  ): Promise<LoadedBuildsResult>
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
      if (uniqueBuildTypeIds.length === 0) {
        return {
          builds: [],
          failedConfigurations: 0,
          transport: 'service-worker',
        }
      }
      const result = await loadSuccessfulBuilds(client, uniqueBuildTypeIds, options)
      return {
        ...result,
        failedConfigurations: 0,
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
