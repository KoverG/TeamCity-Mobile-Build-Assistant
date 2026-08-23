import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../helpers/FakeTeamCityHttpClient'
import { createArtifactBulkPath } from '../../src/teamcity/ArtifactResolver'
import { createSuccessfulBuildsPath } from '../../src/teamcity/BuildFinder'
import { createTeamCityService } from '../../src/teamcity/TeamCityService'
import type { TeamCityHttpClient, TeamCityJsonResult } from '../../src/teamcity/TeamCityTransport'

function successfulBuild(id: string, buildTypeId: string) {
  return {
    id,
    buildTypeId,
    number: id,
    status: 'SUCCESS',
    state: 'finished',
    defaultBranch: true,
  }
}

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

  it('loads several configurations through one combined TeamCity request', async () => {
    const buildTypeIds = ['Synthetic_Android', 'Synthetic_iOS']
    const path = createSuccessfulBuildsPath(buildTypeIds)
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            build: [
              successfulBuild('1001', 'Synthetic_Android'),
              successfulBuild('1002', 'Synthetic_iOS'),
            ],
          },
        ],
      ]),
    )
    const service = createTeamCityService(client)

    const result = await service.loadBuilds(buildTypeIds)

    expect(result.builds.map(({ id }) => id)).toEqual(['1001', '1002'])
    expect(result.failedConfigurations).toBe(0)
    expect(client.requestedPaths).toEqual([path])
  })

  it('does not call TeamCity for an empty configuration list', async () => {
    const client = new FakeTeamCityHttpClient(new Map())
    const service = createTeamCityService(client)

    await expect(service.loadBuilds([])).resolves.toEqual({
      builds: [],
      failedConfigurations: 0,
      transport: 'service-worker',
    })
    expect(client.requestedPaths).toEqual([])
  })

  it('keeps the regular error when the combined build request fails', async () => {
    const client: TeamCityHttpClient = {
      async getJson<T>(): Promise<TeamCityJsonResult<T>> {
        throw new Error('Synthetic combined request failure.')
      },
    }
    const service = createTeamCityService(client)

    await expect(
      service.loadBuilds(['Synthetic_Failed_A', 'Synthetic_Failed_B']),
    ).rejects.toThrow('Synthetic combined request failure.')
  })

  it('does not make a request after caller cancellation', async () => {
    const path = createSuccessfulBuildsPath('Synthetic_Cancelled')
    const client = new FakeTeamCityHttpClient(new Map([[path, { build: [] }]]))
    const controller = new AbortController()
    controller.abort()
    const service = createTeamCityService(client)

    await expect(
      service.loadBuilds(['Synthetic_Cancelled'], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.requestedPaths).toEqual([])
  })

  it('forwards each loaded page before returning the complete result', async () => {
    const firstPath = createSuccessfulBuildsPath('Synthetic_Paged')
    const secondPath = '/app/rest/builds?page=2'
    const client = new FakeTeamCityHttpClient(new Map([
      [
        firstPath,
        {
          build: [successfulBuild('1001', 'Synthetic_Paged')],
          nextHref: secondPath,
        },
      ],
      [secondPath, { build: [successfulBuild('1002', 'Synthetic_Paged')] }],
    ]))
    const pageBuildIds: string[][] = []
    const service = createTeamCityService(client)

    const result = await service.loadBuilds(['Synthetic_Paged'], {
      onPage: ({ builds }) => {
        pageBuildIds.push(builds.map(({ id }) => id))
      },
    })

    expect(pageBuildIds).toEqual([['1001'], ['1002']])
    expect(result.builds.map(({ id }) => id)).toEqual(['1001', '1002'])
  })
})
