import type { TeamCityTransportKind } from './contracts'
import { asRecord, readArray, readBoolean, readString } from './json'
import { toRestPath } from './restPath'
import { TeamCityError } from './TeamCityError'
import type { TeamCityHttpClient } from './TeamCityTransport'

export interface BuildConfiguration {
  id: string
  name: string
  projectId: string
  projectName: string
  paused: boolean
}

export interface CatalogResult {
  configurations: BuildConfiguration[]
  transport: TeamCityTransportKind
}

const catalogPath =
  '/app/rest/buildTypes?fields=count,buildType(id,name,projectId,projectName,paused),nextHref'
const maximumPages = 20

function parseBuildConfiguration(value: unknown): BuildConfiguration | undefined {
  const record = asRecord(value)
  if (record === undefined) {
    return undefined
  }

  const id = readString(record.id)
  const name = readString(record.name)
  const projectId = readString(record.projectId)
  const projectName = readString(record.projectName)

  if (id === undefined || name === undefined || projectId === undefined || projectName === undefined) {
    return undefined
  }

  return {
    id,
    name,
    projectId,
    projectName,
    paused: readBoolean(record.paused) ?? false,
  }
}

export async function loadBuildConfigurations(client: TeamCityHttpClient): Promise<CatalogResult> {
  const configurations = new Map<string, BuildConfiguration>()
  let nextPath: string | undefined = catalogPath
  let transport: TeamCityTransportKind = 'service-worker'

  for (let page = 0; nextPath !== undefined && page < maximumPages; page += 1) {
    const response = await client.getJson<unknown>(nextPath)
    transport = response.transport
    const root = asRecord(response.data)

    if (root === undefined) {
      throw new TeamCityError('UnexpectedResponse', 'TeamCity build types response is invalid.')
    }

    for (const item of readArray(root.buildType)) {
      const configuration = parseBuildConfiguration(item)
      if (configuration !== undefined) {
        configurations.set(configuration.id, configuration)
      }
    }

    const nextHref = readString(root.nextHref)
    nextPath = nextHref === undefined ? undefined : toRestPath(nextHref)
  }

  if (nextPath !== undefined) {
    throw new TeamCityError('TraversalLimitExceeded', 'TeamCity catalog pagination limit was exceeded.')
  }

  return {
    configurations: [...configurations.values()].sort(
      (left, right) =>
        left.projectName.localeCompare(right.projectName) || left.name.localeCompare(right.name),
    ),
    transport,
  }
}
