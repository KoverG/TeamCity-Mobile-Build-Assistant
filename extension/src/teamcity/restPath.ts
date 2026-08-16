import { TeamCityError } from './TeamCityError'

const validationOrigin = 'https://teamcity.example.invalid'

export function normalizeTeamCityRestPath(path: string): string {
  let url: URL

  try {
    url = new URL(path, validationOrigin)
  } catch {
    throw new TeamCityError('InvalidRequest', 'TeamCity REST path is invalid.')
  }

  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    url.origin !== validationOrigin ||
    url.hash.length > 0 ||
    (url.pathname !== '/app/rest' && !url.pathname.startsWith('/app/rest/'))
  ) {
    throw new TeamCityError('InvalidRequest', 'TeamCity REST path is untrusted.')
  }

  return `${url.pathname}${url.search}`
}

export function toTrustedTeamCityUrl(href: string, origin: string): string {
  let baseUrl: URL
  let resolvedUrl: URL

  try {
    baseUrl = new URL(origin)
    resolvedUrl = new URL(href, baseUrl)
  } catch {
    throw new TeamCityError('InvalidRequest', 'TeamCity returned an invalid URL.')
  }

  if (
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    resolvedUrl.origin !== baseUrl.origin ||
    resolvedUrl.username.length > 0 ||
    resolvedUrl.password.length > 0
  ) {
    throw new TeamCityError('InvalidRequest', 'TeamCity returned an untrusted URL.')
  }

  return resolvedUrl.toString()
}

export function createTeamCityBuildPageUrl(buildId: string, origin: string): string {
  const query = new URLSearchParams({ buildId: assertOpaqueId(buildId, 'buildId') })
  return toTrustedTeamCityUrl(`/viewLog.html?${query.toString()}`, origin)
}

export function toRestPath(href: string): string {
  const url = new URL(toTrustedTeamCityUrl(href, window.location.origin))
  return normalizeTeamCityRestPath(`${url.pathname}${url.search}`)
}

export function assertOpaqueId(value: string, fieldName: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new TeamCityError('InvalidRequest', `${fieldName} contains unsupported characters.`)
  }

  return value
}
