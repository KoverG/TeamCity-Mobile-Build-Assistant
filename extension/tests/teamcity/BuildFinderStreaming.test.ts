import { describe, expect, it } from 'vitest'
import { createSuccessfulBuildsPath, loadSuccessfulBuilds } from '../../src/teamcity/BuildFinder'
import { FakeTeamCityHttpClient } from '../helpers/FakeTeamCityHttpClient'

describe('BuildFinder streaming', () => {
  it('streams pages without retaining full build objects when collection is disabled', async () => {
    const firstPath = createSuccessfulBuildsPath('Synthetic_Stream')
    const secondPath = '/app/rest/builds?locator=synthetic-page-2'
    const row = (id: number, number: string) => ({
      id,
      buildTypeId: 'Synthetic_Stream',
      number,
      status: 'SUCCESS',
      state: 'finished',
    })
    const client = new FakeTeamCityHttpClient(new Map([
      [firstPath, { build: [row(1, '100')], nextHref: secondPath }],
      [secondPath, { build: [row(2, '101')] }],
    ]))
    const streamed: string[] = []

    const result = await loadSuccessfulBuilds(client, 'Synthetic_Stream', {
      collectBuilds: false,
      onPage: ({ builds }) => {
        streamed.push(...builds.map(({ id }) => id))
      },
    })

    expect(streamed).toEqual(['1', '2'])
    expect(result.builds).toEqual([])
    expect(client.requestedPaths).toEqual([firstPath, secondPath])
  })
})
