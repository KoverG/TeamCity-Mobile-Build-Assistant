import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../test/FakeTeamCityHttpClient'
import { loadBuildConfigurations } from './CatalogLoader'

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
    expect(client.requestedPaths).toEqual([firstPath, secondPath])
  })
})
