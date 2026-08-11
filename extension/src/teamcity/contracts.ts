export type TeamCityTransportKind = 'service-worker' | 'main-world'

export interface TeamCityGetRequest {
  type: 'teamcity:get'
  path: string
  timeoutMs?: number
}

export interface TeamCityRawResponse {
  ok: boolean
  status: number
  contentType: string
  bodyText: string
  redirectedToLogin: boolean
  truncated: boolean
  transport: TeamCityTransportKind
  attemptedTransports?: TeamCityTransportKind[]
  error?: 'invalid-request' | 'network' | 'tab-unavailable' | 'response-too-large' | 'timeout'
}

export function isTeamCityGetRequest(value: unknown): value is TeamCityGetRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const request = value as Partial<TeamCityGetRequest>
  return (
    request.type === 'teamcity:get' &&
    typeof request.path === 'string' &&
    (request.timeoutMs === undefined ||
      (typeof request.timeoutMs === 'number' && Number.isFinite(request.timeoutMs)))
  )
}

export function isTeamCityRawResponse(value: unknown): value is TeamCityRawResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Partial<TeamCityRawResponse>
  return (
    typeof response.ok === 'boolean' &&
    typeof response.status === 'number' &&
    typeof response.contentType === 'string' &&
    typeof response.bodyText === 'string' &&
    typeof response.redirectedToLogin === 'boolean' &&
    typeof response.truncated === 'boolean' &&
    (response.transport === 'service-worker' || response.transport === 'main-world') &&
    (response.attemptedTransports === undefined ||
      (Array.isArray(response.attemptedTransports) &&
        response.attemptedTransports.every(
          (item) => item === 'service-worker' || item === 'main-world',
        )))
  )
}
