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
  collectBuilds?: boolean
  maximumBuilds?: number
  pageSize?: number
  maximumPages?: number
  query?: BuildSearchQuery
  signal?: AbortSignal
  requestTimeoutMs?: number
  onPage?(result: BuildsResult): void | Promise<void>
}

const defaultPageSize = 50
const defaultMaximumPages = 1_000

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
  buildTypeIds: string | readonly string[],
  count = defaultPageSize,
  searchQuery?: BuildSearchQuery,
): string {
  const safeBuildTypeIds = [...new Set(
    (typeof buildTypeIds === 'string' ? [buildTypeIds] : buildTypeIds)
      .map((buildTypeId) => assertOpaqueId(buildTypeId, 'buildTypeId')),
  )]
  if (safeBuildTypeIds.length === 0) {
    throw new TeamCityError('InvalidRequest', 'At least one buildTypeId is required.')
  }
  const buildTypeLocator = safeBuildTypeIds.length === 1
    ? `buildType:(id:${safeBuildTypeIds[0]})`
    : `buildType:(${safeBuildTypeIds.map((id) => `item:(id:${id})`).join(',')})`
  const safeCount = boundedInteger(count, defaultPageSize, 1, 100)
  const locator = [
    buildTypeLocator,
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
  buildTypeIds: string | readonly string[],
  options: BuildLoadOptions = {},
): Promise<BuildsResult> {
  const collectBuilds = options.collectBuilds ?? true
  const builds = new Map<string, TeamCityBuild>()
  const seenBuildIds = new Set<string>()
  const requestedMaximum = Math.trunc(options.maximumBuilds ?? Number.MAX_SAFE_INTEGER)
  const maximumBuilds = Number.isFinite(requestedMaximum)
    ? Math.min(Math.max(requestedMaximum, 1), Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER
  const pageSize = boundedInteger(options.pageSize, defaultPageSize, 1, 100)
  const firstPageCount = Math.min(pageSize, maximumBuilds)
  const maximumPages = boundedInteger(
    options.maximumPages,
    defaultMaximumPages,
    1,
    defaultMaximumPages,
  )
  let nextPath: string | undefined = createSuccessfulBuildsPath(
    buildTypeIds,
    firstPageCount,
    options.query,
  )
  let transport: TeamCityTransportKind = 'service-worker'
  const visitedPaths = new Set<string>()

  let page = 0
  for (; nextPath !== undefined && page < maximumPages && seenBuildIds.size < maximumBuilds; page += 1) {
    if (visitedPaths.has(nextPath)) {
      throw new TeamCityError(
        'TraversalLimitExceeded',
        'TeamCity builds pagination returned a repeated page.',
      )
    }
    visitedPaths.add(nextPath)
    const response = await client.getJson<unknown>(nextPath, {
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs,
    })
    transport = response.transport
    const root = asRecord(response.data)

    if (root === undefined) {
      throw new TeamCityError('UnexpectedResponse', 'TeamCity builds response is invalid.')
    }

    const pageBuilds: TeamCityBuild[] = []
    for (const build of readArray(root.build).map(parseBuild).filter((item) => item !== undefined)) {
      if (seenBuildIds.size < maximumBuilds && !seenBuildIds.has(build.id)) {
        seenBuildIds.add(build.id)
        if (collectBuilds) {
          builds.set(build.id, build)
        }
        pageBuilds.push(build)
      }
    }
    if (pageBuilds.length > 0) {
      await options.onPage?.({ builds: pageBuilds, transport })
    }

    const nextHref = readString(root.nextHref)
    nextPath = nextHref === undefined ? undefined : toRestPath(nextHref)
  }

  if (nextPath !== undefined && seenBuildIds.size < maximumBuilds && page >= maximumPages) {
    throw new TeamCityError('TraversalLimitExceeded', 'TeamCity builds pagination limit was exceeded.')
  }

  return { builds: [...builds.values()], transport }
}
