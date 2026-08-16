import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../test/FakeTeamCityHttpClient'
import { createArtifactBulkPath } from './ArtifactResolver'
import { createTeamCityService } from './TeamCityService'
import type { TeamCityHttpClient, TeamCityJsonResult } from './TeamCityTransport'

describe('createTeamCityService', () => {
  it('connects artifact resolution to the bulk TeamCity GET', async () => {
    const bulkPath = createArtifactBulkPath('801', 'android')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'synthetic.apk',
                fullName: 'output/synthetic.apk',
                content: { href: '/repository/download/synthetic/mobile.apk' },
              },
            ],
          },
        ],
      ]),
    )
    const service = createTeamCityService(client)

    await expect(
      service.resolveArtifact('801', 'Synthetic_Mobile_Android', 'android'),
    ).resolves.toMatchObject({ status: 'Resolved' })
    expect(client.requestedPaths).toEqual([bulkPath])
  })

  it('bounds parallel build-configuration requests', async () => {
    let activeRequests = 0
    let maximumConcurrency = 0
    const requestedPaths: string[] = []
    const client: TeamCityHttpClient = {
      async getJson<T>(path: string): Promise<TeamCityJsonResult<T>> {
        requestedPaths.push(path)
        activeRequests += 1
        maximumConcurrency = Math.max(maximumConcurrency, activeRequests)
        await new Promise((resolve) => setTimeout(resolve, 2))
        activeRequests -= 1
        return {
          data: { build: [] } as T,
          transport: 'service-worker',
          status: 200,
        }
      },
    }
    const service = createTeamCityService(client)

    await service.loadBuilds(
      Array.from({ length: 10 }, (_, index) => `Synthetic_Mobile_${index}`),
      { maximumBuilds: 20 },
    )

    expect(requestedPaths).toHaveLength(10)
    expect(maximumConcurrency).toBeLessThanOrEqual(4)
  })
})
