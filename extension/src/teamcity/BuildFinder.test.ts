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

  it('uses the default page size for a non-finite count', () => {
    const path = createSuccessfulBuildsPath('Example_Mobile', Number.NaN)
    const locator = new URLSearchParams(path.split('?')[1]).get('locator')

    expect(locator).toContain('count:20')
  })

  it('uses an encoded case-insensitive partial branch condition for task search', () => {
    const path = createSuccessfulBuildsPath('Example_Mobile', 20, {
      mode: 'task',
      value: 'TASK-123',
    })
    const locator = new URLSearchParams(path.split('?')[1]).get('locator')

    expect(locator).toContain(
      'branch:(name:(value:($base64:VEFTSy0xMjM),matchType:contains,ignoreCase:true),default:any)',
    )
    expect(locator).not.toContain('number:')
  })

  it('keeps a numeric task fragment as a partial branch search', () => {
    const path = createSuccessfulBuildsPath('Example_Mobile', 20, {
      mode: 'task',
      value: '123',
    })
    const locator = new URLSearchParams(path.split('?')[1]).get('locator')

    expect(locator).toContain(
      'branch:(name:(value:($base64:MTIz),matchType:contains,ignoreCase:true),default:any)',
    )
  })

  it('uses an encoded exact public build number while allowing every branch', () => {
    const path = createSuccessfulBuildsPath('Example_Mobile', 20, {
      mode: 'build',
      value: 'release:42,1',
    })
    const locator = new URLSearchParams(path.split('?')[1]).get('locator')

    expect(locator).toContain('number:($base64:cmVsZWFzZTo0Miwx)')
    expect(locator).toContain('branch:default:any')
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

  it('stops at the requested build limit without following another page', async () => {
    const firstPath = createSuccessfulBuildsPath('Synthetic_Mobile', 1)
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          firstPath,
          {
            build: [
              {
                id: 1,
                buildTypeId: 'Synthetic_Mobile',
                number: 'one',
                status: 'SUCCESS',
                state: 'finished',
              },
            ],
            nextHref: '/app/rest/builds?page=2',
          },
        ],
      ]),
    )

    const result = await loadSuccessfulBuilds(client, 'Synthetic_Mobile', {
      maximumBuilds: 1,
    })

    expect(result.builds.map(({ id }) => id)).toEqual(['1'])
    expect(client.requestedPaths).toEqual([firstPath])
  })
})
