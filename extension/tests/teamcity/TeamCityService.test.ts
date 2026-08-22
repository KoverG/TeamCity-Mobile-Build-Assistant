import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../helpers/FakeTeamCityHttpClient'
import { createArtifactBulkPath } from '../../src/teamcity/ArtifactResolver'
import { createSuccessfulBuildsPath } from '../../src/teamcity/BuildFinder'
import { createTeamCityService } from '../../src/teamcity/TeamCityService'
import type { TeamCityHttpClient, TeamCityJsonResult } from '../../src/teamcity/TeamCityTransport'

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

  it('keeps successful build configurations when another configuration fails', async () => {
    const successfulPath = createSuccessfulBuildsPath('Synthetic_Healthy', 20)
    const failedPath = createSuccessfulBuildsPath('Synthetic_Failed', 20)
    const requestedPaths: string[] = []
    const client: TeamCityHttpClient = {
      async getJson<T>(path: string): Promise<TeamCityJsonResult<T>> {
        requestedPaths.push(path)
        if (path === failedPath) {
          throw new Error('Synthetic configuration failure.')
        }
        if (path !== successfulPath) {
          throw new Error('Unexpected synthetic path.')
        }
        return {
          data: {
            build: [{
              id: '1001',
              buildTypeId: 'Synthetic_Healthy',
              number: '42',
              status: 'SUCCESS',
              state: 'finished',
              defaultBranch: true,
            }],
          } as T,
          transport: 'main-world',
          status: 200,
        }
      },
    }
    const service = createTeamCityService(client)

    const result = await service.loadBuilds(
      ['Synthetic_Healthy', 'Synthetic_Failed'],
      { maximumBuilds: 20 },
    )

    expect(result.builds.map(({ id }) => id)).toEqual(['1001'])
    expect(result.failedConfigurations).toBe(1)
    expect(requestedPaths).toEqual(expect.arrayContaining([successfulPath, failedPath]))
  })

  it('keeps the regular error when every build configuration fails', async () => {
    const requestedPaths: string[] = []
    const client: TeamCityHttpClient = {
      async getJson<T>(path: string): Promise<TeamCityJsonResult<T>> {
        requestedPaths.push(path)
        throw new Error('Synthetic total configuration failure.')
      },
    }
    const service = createTeamCityService(client)

    await expect(
      service.loadBuilds(['Synthetic_Failed_A', 'Synthetic_Failed_B'], {
        maximumBuilds: 20,
      }),
    ).rejects.toThrow('Synthetic total configuration failure.')
    expect(requestedPaths).toHaveLength(2)
  })

  it('does not convert caller cancellation into a partial configuration failure', async () => {
    const path = createSuccessfulBuildsPath('Synthetic_Cancelled', 20)
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            build: [],
          },
        ],
      ]),
    )
    const controller = new AbortController()
    controller.abort()
    const service = createTeamCityService(client)

    await expect(
      service.loadBuilds(['Synthetic_Cancelled'], {
        maximumBuilds: 20,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.requestedPaths).toEqual([])
  })
})
