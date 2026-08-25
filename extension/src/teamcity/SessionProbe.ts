import type { TeamCityTransportKind } from './contracts'
import { asRecord, readOpaqueString } from './json'
import { TeamCityError } from './TeamCityError'
import type { TeamCityHttpClient } from './TeamCityTransport'

export interface SessionProbeResult {
  authenticated: true
  userId: string
  transport: TeamCityTransportKind
}

export async function probeSession(client: TeamCityHttpClient): Promise<SessionProbeResult> {
  const response = await client.getJson<unknown>('/app/rest/users/current?fields=id')
  const user = asRecord(response.data)

  const userId = user === undefined ? undefined : readOpaqueString(user.id)
  if (userId === undefined) {
    throw new TeamCityError('UnexpectedResponse', 'TeamCity current user response is invalid.')
  }

  return {
    authenticated: true,
    userId,
    transport: response.transport,
  }
}
