import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../helpers/FakeTeamCityHttpClient'
import { loadBuildConfigurations } from '../../src/teamcity/CatalogLoader'

describe('loadBuildConfigurations', () => {
  it('follows same-origin pagination and returns a stable sorted catalog', async () => {
    const firstPath =
      '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
    const secondPath = '/app/rest/buildTypes?page=2'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          firstPath,
          {
            buildType: [
              {
                id: 'SyntheticProjectB_Ios_Stage',
                name: 'iOS stage',
                projectId: 'SyntheticProjectB',
                projectName: 'Synthetic Project B',
                paused: false,
              },
            ],
            nextHref: secondPath,
          },
        ],
        [
          secondPath,
          {
            buildType: [
              {
                id: 'SyntheticProjectA_Android_Stage',
                name: 'Android stage',
                projectId: 'SyntheticProjectA',
                projectName: 'Synthetic Project A',
                paused: false,
              },
            ],
          },
        ],
      ]),
    )

    const result = await loadBuildConfigurations(client)

    expect(result.configurations.map(({ id }) => id)).toEqual([
      'SyntheticProjectA_Android_Stage',
      'SyntheticProjectB_Ios_Stage',
    ])
    expect(result.skippedConfigurations).toBe(0)
    expect(client.requestedPaths).toEqual([firstPath, secondPath])
  })

  it('keeps valid configurations and reports malformed entries', async () => {
    const path =
      '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            buildType: [
              {
                id: 'SyntheticProject_Android_Stage',
                name: 'Android stage',
                projectId: 'SyntheticProject',
                projectName: 'Synthetic Project',
                paused: false,
              },
              {
                id: 'SyntheticProject_Invalid',
                projectId: 'SyntheticProject',
                projectName: 'Synthetic Project',
              },
            ],
          },
        ],
      ]),
    )

    const result = await loadBuildConfigurations(client)

    expect(result.configurations.map(({ id }) => id)).toEqual([
      'SyntheticProject_Android_Stage',
    ])
    expect(result.skippedConfigurations).toBe(1)
  })

  it('rejects a catalog that contains only malformed configurations', async () => {
    const path =
      '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            buildType: [
              {
                id: 'SyntheticProject_Invalid',
                projectId: 'SyntheticProject',
              },
            ],
          },
        ],
      ]),
    )

    await expect(loadBuildConfigurations(client)).rejects.toMatchObject({
      name: 'TeamCityError',
      code: 'UnexpectedResponse',
    })
  })

  it('rejects an invalid build type list contract', async () => {
    const path =
      '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            buildType: {
              id: 'SyntheticProject_Android_Stage',
            },
          },
        ],
      ]),
    )

    await expect(loadBuildConfigurations(client)).rejects.toMatchObject({
      name: 'TeamCityError',
      code: 'UnexpectedResponse',
    })
  })

  it('allows a valid empty catalog', async () => {
    const path =
      '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            buildType: [],
          },
        ],
      ]),
    )

    const result = await loadBuildConfigurations(client)

    expect(result.configurations).toEqual([])
    expect(result.skippedConfigurations).toBe(0)
  })
})
