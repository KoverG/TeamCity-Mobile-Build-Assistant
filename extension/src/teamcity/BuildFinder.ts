import type { TeamCityTransportKind } from './contracts'
import { asRecord, readArray, readBoolean, readOpaqueString, readString } from './json'
import { assertOpaqueId } from './restPath'
import { toRestPath } from './restPath'
import { TeamCityError } from './TeamCityError'
import type { TeamCityHttpClient } from './TeamCityTransport'

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

export function createSuccessfulBuildsPath(buildTypeId: string, count = 20): string {
  const safeBuildTypeId = assertOpaqueId(buildTypeId, 'buildTypeId')
  const safeCount = Math.min(Math.max(Math.trunc(count), 1), 100)
  const locator = [
    `buildType:(id:${safeBuildTypeId})`,
    'state:finished',
    'status:SUCCESS',
    'branch:default:any',
    `count:${safeCount}`,
  ].join(',')
  const fields =
    'count,build(id,buildTypeId,number,status,state,branchName,defaultBranch,finishDate),nextHref'
  const query = new URLSearchParams({ locator, fields })

  return `/app/rest/builds?${query.toString()}`
}

export async function loadSuccessfulBuilds(
  client: TeamCityHttpClient,
  buildTypeId: string,
): Promise<BuildsResult> {
  const builds = new Map<string, TeamCityBuild>()
  let nextPath: string | undefined = createSuccessfulBuildsPath(buildTypeId)
  let transport: TeamCityTransportKind = 'service-worker'

  for (let page = 0; nextPath !== undefined && page < maximumPages; page += 1) {
    const response = await client.getJson<unknown>(nextPath)
    transport = response.transport
    const root = asRecord(response.data)

    if (root === undefined) {
      throw new TeamCityError('UnexpectedResponse', 'TeamCity builds response is invalid.')
    }

    for (const build of readArray(root.build).map(parseBuild).filter((item) => item !== undefined)) {
      builds.set(build.id, build)
    }

    const nextHref = readString(root.nextHref)
    nextPath = nextHref === undefined ? undefined : toRestPath(nextHref)
  }

  if (nextPath !== undefined) {
    throw new TeamCityError('TraversalLimitExceeded', 'TeamCity builds pagination limit was exceeded.')
  }

  return { builds: [...builds.values()], transport }
}
