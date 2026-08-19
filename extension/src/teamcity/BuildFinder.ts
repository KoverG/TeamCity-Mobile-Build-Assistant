import type { TeamCityTransportKind } from './contracts'
import { asRecord, readArray, readBoolean, readOpaqueString, readString } from './json'
import { boundedInteger } from './limits'
import { assertOpaqueId } from './restPath'
import { toRestPath } from './restPath'
import { TeamCityError } from './TeamCityError'
import type { TeamCityHttpClient } from './TeamCityTransport'
import {
  maximumBuildSearchQueryLength,
  normalizeBuildSearchQuery,
  type BuildSearchQuery,
} from './BuildSearch'

export interface TeamCityBuild {
  id: string
  buildTypeId: string
  number: string
  branchName?: string
  defaultBranch: boolean
  finishDate?: string
}

export interface BuildsResult {
  builds: TeamCityBuild[]
  transport: TeamCityTransportKind
}

export interface BuildLoadOptions {
  maximumBuilds?: number
  query?: BuildSearchQuery
  signal?: AbortSignal
  requestTimeoutMs?: number
}

const maximumPages = 20

function parseBuild(value: unknown): TeamCityBuild | undefined {
  const record = asRecord(value)
  if (record === undefined) {
    return undefined
  }

  const id = readOpaqueString(record.id)
  const buildTypeId = readString(record.buildTypeId)
  const number = readOpaqueString(record.number)

  if (id === undefined || buildTypeId === undefined || number === undefined) {
    return undefined
  }

  if (record.status !== 'SUCCESS' || record.state !== 'finished') {
    return undefined
  }

  return {
    id,
    buildTypeId,
    number,
    branchName: readString(record.branchName),
    defaultBranch: readBoolean(record.defaultBranch) ?? false,
    finishDate: readString(record.finishDate),
  }
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function searchLocator(query: BuildSearchQuery | undefined): string[] {
  if (query === undefined) {
    return ['branch:default:any']
  }

  const normalizedValue = normalizeBuildSearchQuery(query.value)
  if (normalizedValue.length === 0) {
    return ['branch:default:any']
  }
  if (query.value.trim().length > maximumBuildSearchQueryLength) {
    throw new TeamCityError('InvalidRequest', 'Build search query is too long.')
  }

  const encodedValue = `($base64:${toBase64Url(normalizedValue)})`
  return query.mode === 'task'
    ? [
        `branch:(name:(value:${encodedValue},matchType:contains,ignoreCase:true),default:any)`,
      ]
    : [`number:${encodedValue}`, 'branch:default:any']
}

export function createSuccessfulBuildsPath(
  buildTypeId: string,
  count = 20,
  searchQuery?: BuildSearchQuery,
): string {
  const safeBuildTypeId = assertOpaqueId(buildTypeId, 'buildTypeId')
  const safeCount = boundedInteger(count, 20, 1, 100)
  const locator = [
    `buildType:(id:${safeBuildTypeId})`,
    'state:finished',
    'status:SUCCESS',
    ...searchLocator(searchQuery),
    `count:${safeCount}`,
  ].join(',')
  const fields =
    'count,build(id,buildTypeId,number,status,state,branchName,defaultBranch,finishDate),nextHref'
  const urlQuery = new URLSearchParams({ locator, fields })

  return `/app/rest/builds?${urlQuery.toString()}`
}

export async function loadSuccessfulBuilds(
  client: TeamCityHttpClient,
  buildTypeId: string,
  options: BuildLoadOptions = {},
): Promise<BuildsResult> {
  const builds = new Map<string, TeamCityBuild>()
  const requestedMaximum = Math.trunc(options.maximumBuilds ?? Number.MAX_SAFE_INTEGER)
  const maximumBuilds = Number.isFinite(requestedMaximum)
    ? Math.min(Math.max(requestedMaximum, 1), Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER
  const firstPageCount = options.maximumBuilds === undefined
    ? 20
    : Math.min(maximumBuilds, 100)
  let nextPath: string | undefined = createSuccessfulBuildsPath(
    buildTypeId,
    firstPageCount,
    options.query,
  )
  let transport: TeamCityTransportKind = 'service-worker'

  let page = 0
  for (; nextPath !== undefined && page < maximumPages && builds.size < maximumBuilds; page += 1) {
    const response = await client.getJson<unknown>(nextPath, {
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs,
    })
    transport = response.transport
    const root = asRecord(response.data)

    if (root === undefined) {
      throw new TeamCityError('UnexpectedResponse', 'TeamCity builds response is invalid.')
    }

    for (const build of readArray(root.build).map(parseBuild).filter((item) => item !== undefined)) {
      if (builds.size < maximumBuilds) {
        builds.set(build.id, build)
      }
    }

    const nextHref = readString(root.nextHref)
    nextPath = nextHref === undefined ? undefined : toRestPath(nextHref)
  }

  if (nextPath !== undefined && builds.size < maximumBuilds && page >= maximumPages) {
    throw new TeamCityError('TraversalLimitExceeded', 'TeamCity builds pagination limit was exceeded.')
  }

  return { builds: [...builds.values()], transport }
}
