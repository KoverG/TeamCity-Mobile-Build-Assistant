import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../test/FakeTeamCityHttpClient'
import { createSuccessfulBuildsPath, loadSuccessfulBuilds } from './BuildFinder'

describe('BuildFinder', () => {
  it('requests only successful finished builds while allowing every branch', () => {
    const path = createSuccessfulBuildsPath('Example_Mobile', 500)
    const locator = new URLSearchParams(path.split('?')[1]).get('locator')

    expect(locator).toContain('buildType:(id:Example_Mobile)')
    expect(locator).toContain('state:finished')
    expect(locator).toContain('status:SUCCESS')
    expect(locator).toContain('branch:default:any')
    expect(locator).toContain('count:100')
  })

  it('defensively excludes incompatible rows returned by TeamCity', async () => {
    const path = createSuccessfulBuildsPath('Example_Mobile')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          path,
          {
            build: [
              {
                id: 101,
                buildTypeId: 'Example_Mobile',
                number: '42',
                status: 'SUCCESS',
                state: 'finished',
                branchName: 'feature/example',
              },
              {
                id: 102,
                buildTypeId: 'Example_Mobile',
                number: '43',
                status: 'FAILURE',
                state: 'finished',
              },
            ],
          },
        ],
      ]),
    )

    const result = await loadSuccessfulBuilds(client, 'Example_Mobile')

    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]).toMatchObject({ id: '101', number: '42' })
  })

  it('follows server-provided pagination', async () => {
    const firstPath = createSuccessfulBuildsPath('Synthetic_Mobile')
    const secondPath = '/app/rest/builds?page=2'
    const successfulBuild = (id: number, number: string) => ({
      id,
      buildTypeId: 'Synthetic_Mobile',
      number,
      status: 'SUCCESS',
      state: 'finished',
    })
    const client = new FakeTeamCityHttpClient(
      new Map([
        [firstPath, { build: [successfulBuild(1, 'one')], nextHref: secondPath }],
        [secondPath, { build: [successfulBuild(2, 'two')] }],
      ]),
    )

    const result = await loadSuccessfulBuilds(client, 'Synthetic_Mobile')

    expect(result.builds.map(({ id }) => id)).toEqual(['1', '2'])
    expect(client.requestedPaths).toEqual([firstPath, secondPath])
  })
})
