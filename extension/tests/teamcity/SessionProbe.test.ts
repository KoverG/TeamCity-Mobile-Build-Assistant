import { describe, expect, it } from 'vitest'
import { probeSession } from '../../src/teamcity/SessionProbe'
import { FakeTeamCityHttpClient } from '../helpers/FakeTeamCityHttpClient'

describe('SessionProbe', () => {
  it('returns only the opaque current-user id needed for session-scoped cache isolation', async () => {
    const path = '/app/rest/users/current?fields=id'
    const client = new FakeTeamCityHttpClient(new Map([
      [path, { id: 'synthetic-user' }],
    ]))

    await expect(probeSession(client)).resolves.toEqual({
      authenticated: true,
      userId: 'synthetic-user',
      transport: 'main-world',
    })
    expect(client.requestedPaths).toEqual([path])
  })
})
