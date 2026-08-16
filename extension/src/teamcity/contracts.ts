export type TeamCityTransportKind = 'service-worker' | 'main-world'

export interface TeamCityGetRequest {
  type: 'teamcity:get'
  path: string
  timeoutMs?: number
}

export interface OpenTeamCityBuildRequest {
  type: 'teamcity:open-build'
  buildId: string
}

export interface OpenTeamCityBuildResponse {
  ok: boolean
  error?: 'invalid-request' | 'tab-unavailable' | 'open-failed'
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

export function isOpenTeamCityBuildRequest(value: unknown): value is OpenTeamCityBuildRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const request = value as Partial<OpenTeamCityBuildRequest>
  return request.type === 'teamcity:open-build' && typeof request.buildId === 'string'
}

export function isOpenTeamCityBuildResponse(value: unknown): value is OpenTeamCityBuildResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const response = value as Partial<OpenTeamCityBuildResponse>
  return (
    typeof response.ok === 'boolean' &&
    (response.error === undefined ||
      response.error === 'invalid-request' ||
      response.error === 'tab-unavailable' ||
      response.error === 'open-failed')
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
