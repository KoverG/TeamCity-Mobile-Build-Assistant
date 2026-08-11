import {
  resolveMobileArtifact,
  type ArtifactResolution,
  type MobilePlatform,
} from './ArtifactResolver'
import { loadSuccessfulBuilds, type BuildsResult } from './BuildFinder'
import { loadBuildConfigurations, type CatalogResult } from './CatalogLoader'
import { probeSession } from './SessionProbe'
import {
  BrowserSessionTeamCityTransport,
  type TeamCityHttpClient,
} from './TeamCityTransport'

export interface TeamCityService {
  loadCatalog(): Promise<CatalogResult>
  loadBuilds(buildTypeIds: readonly string[]): Promise<BuildsResult>
  resolveArtifact(
    buildId: string,
    buildTypeId: string,
    platform: MobilePlatform,
  ): Promise<ArtifactResolution>
}

export function createTeamCityService(
  client: TeamCityHttpClient = new BrowserSessionTeamCityTransport(),
): TeamCityService {
  return {
    async loadCatalog() {
      await probeSession(client)
      return await loadBuildConfigurations(client)
    },
    async loadBuilds(buildTypeIds) {
      const results = await Promise.all(
        [...new Set(buildTypeIds)].map((buildTypeId) => loadSuccessfulBuilds(client, buildTypeId)),
      )
      const builds = new Map(results.flatMap((result) => result.builds).map((build) => [build.id, build]))
      return {
        builds: [...builds.values()].sort((left, right) =>
          (right.finishDate ?? '').localeCompare(left.finishDate ?? ''),
        ),
        transport: results.at(-1)?.transport ?? 'service-worker',
      }
    },
    async resolveArtifact(buildId, buildTypeId, platform) {
      return await resolveMobileArtifact(client, buildId, platform, { buildTypeId })
    },
  }
}

export type { ArtifactResolution, BuildsResult, CatalogResult, MobilePlatform }
