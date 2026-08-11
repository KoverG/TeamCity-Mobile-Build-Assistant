import { TeamCityError } from './TeamCityError'

export function toRestPath(href: string): string {
  let url: URL

  try {
    url = new URL(href, window.location.origin)
  } catch {
    throw new TeamCityError('InvalidRequest', 'TeamCity returned an invalid REST href.')
  }

  if (url.origin !== window.location.origin || !url.pathname.startsWith('/app/rest')) {
    throw new TeamCityError('InvalidRequest', 'TeamCity returned an untrusted REST href.')
  }

  return `${url.pathname}${url.search}`
}

export function assertOpaqueId(value: string, fieldName: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new TeamCityError('InvalidRequest', `${fieldName} contains unsupported characters.`)
  }

  return value
}
