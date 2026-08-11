import type { TeamCityTransportKind } from './contracts'
import { asRecord, readArray, readString } from './json'
import { assertOpaqueId, toRestPath } from './restPath'
import { TeamCityError } from './TeamCityError'
import type { TeamCityHttpClient } from './TeamCityTransport'

export type MobilePlatform = 'android' | 'ios'

export interface ArtifactCandidate {
  name: string
  fullName: string
  contentHref: string
}

export interface ArtifactResolutionDiagnostics {
  strategy: 'bulk' | 'fallback'
  requestCount: number
  visitedNodes: number
  bulkExpandedArchives: boolean
}

export interface ArtifactResolution {
  status: 'NotFound' | 'Resolved' | 'Ambiguous'
  candidates: ArtifactCandidate[]
  transport: TeamCityTransportKind
  diagnostics: ArtifactResolutionDiagnostics
}

export interface ArtifactResolverOptions {
  signal?: AbortSignal
  timeoutMs?: number
  requestTimeoutMs?: number
  fallbackConcurrency?: number
  maximumFallbackRequests?: number
  buildTypeId?: string
}

interface ArtifactNode {
  name: string
  fullName: string
  metadataHref?: string
  contentHref?: string
  childrenHref?: string
  children: ArtifactNode[]
}

interface QueueItem {
  path: string
  depth: number
}

const bulkArtifactFields = 'count,file(name,fullName,href,content(href),children(count,href))'
const fallbackArtifactFields = 'file(name,fullName,href,content(href),children(count,href))'
const artifactMetadataFields =
  'name,fullName,href,content(href),children(count,href,file(name,fullName,href,content(href),children(count,href)))'
const maximumDepth = 8
const maximumNodes = 5_000
const defaultOverallTimeoutMs = 120_000
const defaultRequestTimeoutMs = 30_000
const defaultFallbackConcurrency = 4
const defaultMaximumFallbackRequests = 40

function parseArtifactNode(value: unknown): ArtifactNode | undefined {
  const record = asRecord(value)
  if (record === undefined) {
    return undefined
  }

  const name = readString(record.name)
  const fullName = readString(record.fullName) ?? name
  if (name === undefined || fullName === undefined) {
    return undefined
  }

  const content = asRecord(record.content)
  const children = asRecord(record.children)

  return {
    name,
    fullName,
    metadataHref: readString(record.href),
    contentHref: content === undefined ? undefined : readString(content.href),
    childrenHref: children === undefined ? undefined : readString(children.href),
    children: children === undefined
      ? []
      : readArray(children.file)
          .map(parseArtifactNode)
          .filter((child) => child !== undefined),
  }
}

function parseArtifactNodes(value: unknown): ArtifactNode[] {
  const root = asRecord(value)
  if (root === undefined) {
    throw new TeamCityError('UnexpectedResponse', 'TeamCity artifact response is invalid.')
  }

  const rootNode = parseArtifactNode(value)
  return rootNode === undefined
    ? readArray(root.file).map(parseArtifactNode).filter((node) => node !== undefined)
    : [rootNode]
}

function flattenNodes(nodes: readonly ArtifactNode[]): ArtifactNode[] {
  const result: ArtifactNode[] = []
  const visit = (node: ArtifactNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return result
}

function isTargetArtifact(node: ArtifactNode, platform: MobilePlatform): boolean {
  const normalizedName = node.name.toLowerCase()
  return platform === 'android' ? normalizedName.endsWith('.apk') : normalizedName.endsWith('.ipa')
}

function isBrowsableArchive(node: ArtifactNode): boolean {
  const normalizedName = node.name.toLowerCase()
  return normalizedName.endsWith('.nupkg') || normalizedName.endsWith('.zip')
}

function withMetadataFields(href: string): string {
  const path = toRestPath(href)
  const url = new URL(path, window.location.origin)
  url.searchParams.set('fields', artifactMetadataFields)
  return toRestPath(url.toString())
}

function createResolution(
  candidates: ReadonlyMap<string, ArtifactCandidate>,
  transport: TeamCityTransportKind,
  diagnostics: ArtifactResolutionDiagnostics,
): ArtifactResolution {
  const resolvedCandidates = [...candidates.values()]
  const status = resolvedCandidates.length === 0
    ? 'NotFound'
    : resolvedCandidates.length === 1
      ? 'Resolved'
      : 'Ambiguous'

  return { status, candidates: resolvedCandidates, transport, diagnostics }
}

function canFallbackFromBulkError(error: unknown): boolean {
  return error instanceof TeamCityError &&
    (error.code === 'UnexpectedResponse' ||
      error.code === 'ResponseTooLarge' ||
      error.code === 'InvalidRequest')
}

export function createArtifactBulkPath(buildId: string, platform: MobilePlatform): string {
  const safeBuildId = assertOpaqueId(buildId, 'buildId')
  const extensionPattern = platform === 'android' ? '**/*.apk' : '**/*.ipa'
  const query = new URLSearchParams({
    locator: `recursive:true,browseArchives:true,pattern:${extensionPattern}`,
    fields: bulkArtifactFields,
    resolveParameters: 'false',
    logBuildUsage: 'false',
  })
  return `/app/rest/builds/id:${safeBuildId}/artifacts?${query.toString()}`
}

export function createArtifactRootPath(buildId: string): string {
  const safeBuildId = assertOpaqueId(buildId, 'buildId')
  const query = new URLSearchParams({ fields: fallbackArtifactFields })
  return `/app/rest/builds/id:${safeBuildId}/artifacts/children?${query.toString()}`
}

export function createRepositoryDownloadPath(
  buildTypeId: string,
  buildId: string,
  artifactPath: string,
): string {
  const safeBuildTypeId = assertOpaqueId(buildTypeId, 'buildTypeId')
  const safeBuildId = assertOpaqueId(buildId, 'buildId')
  const segments = artifactPath.split('/')

  if (
    artifactPath.length === 0 ||
    artifactPath.startsWith('/') ||
    artifactPath.includes('\\') ||
    artifactPath.includes('://') ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new TeamCityError('InvalidRequest', 'TeamCity returned an invalid artifact path.')
  }

  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/')
  return `/repository/download/${safeBuildTypeId}/${safeBuildId}:id/${encodedPath}`
}

export async function resolveMobileArtifact(
  client: TeamCityHttpClient,
  buildId: string,
  platform: MobilePlatform,
  options: ArtifactResolverOptions = {},
): Promise<ArtifactResolution> {
  const controller = new AbortController()
  const overallTimeoutMs = Math.max(
    1,
    Math.trunc(options.timeoutMs ?? defaultOverallTimeoutMs),
  )
  const requestTimeoutMs = Math.max(
    1,
    Math.trunc(options.requestTimeoutMs ?? defaultRequestTimeoutMs),
  )
  const timeout = setTimeout(() => controller.abort(), overallTimeoutMs)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const visitedPaths = new Set<string>()
  const visitedNodes = new Set<string>()
  const candidates = new Map<string, ArtifactCandidate>()
  const targetNodes = new Map<string, ArtifactNode>()
  let requestCount = 0
  let transport: TeamCityTransportKind = 'service-worker'
  let bulkNodes: ArtifactNode[] = []
  let bulkSucceeded = false

  const visitNode = (node: ArtifactNode): void => {
    const nodeKey = node.metadataHref ?? node.contentHref ?? node.childrenHref ?? node.fullName
    if (!visitedNodes.has(nodeKey)) {
      visitedNodes.add(nodeKey)
      if (visitedNodes.size > maximumNodes) {
        throw new TeamCityError(
          'TraversalLimitExceeded',
          'TeamCity artifact node safety limit was exceeded.',
        )
      }
    }

    if (isTargetArtifact(node, platform)) {
      targetNodes.set(node.fullName, node)
      if (node.contentHref !== undefined) {
        candidates.set(node.contentHref, {
          name: node.name,
          fullName: node.fullName,
          contentHref: node.contentHref,
        })
      }
    }
  }

  const addRepositoryFallbacks = (): void => {
    if (options.buildTypeId === undefined) {
      return
    }

    const resolvedFullNames = new Set([...candidates.values()].map((candidate) => candidate.fullName))
    for (const node of targetNodes.values()) {
      if (!resolvedFullNames.has(node.fullName)) {
        const contentHref = createRepositoryDownloadPath(
          options.buildTypeId,
          buildId,
          node.fullName,
        )
        candidates.set(contentHref, {
          name: node.name,
          fullName: node.fullName,
          contentHref,
        })
      }
    }
  }

  try {
    try {
      requestCount += 1
      const bulkResponse = await client.getJson<unknown>(createArtifactBulkPath(buildId, platform), {
        signal: controller.signal,
        timeoutMs: requestTimeoutMs,
      })
      transport = bulkResponse.transport
      bulkNodes = flattenNodes(parseArtifactNodes(bulkResponse.data))
      bulkNodes.forEach(visitNode)
      bulkSucceeded = true
    } catch (error) {
      if (controller.signal.aborted) {
        throw new TeamCityError('RequestTimeout', 'TeamCity artifact search timed out.')
      }
      if (!canFallbackFromBulkError(error)) {
        throw error
      }
    }

    const archives = bulkNodes.filter(isBrowsableArchive)
    const unexpandedArchives = archives.filter((archive) => {
      const archivePrefix = `${archive.fullName}!/`
      return !bulkNodes.some((node) => node.fullName.startsWith(archivePrefix))
    })
    const unresolvedTargets = bulkNodes.filter(
      (node) => isTargetArtifact(node, platform) && node.contentHref === undefined,
    )
    const bulkExpandedArchives = archives.length > 0 && unexpandedArchives.length === 0

    if (
      bulkSucceeded &&
      candidates.size > 0 &&
      unexpandedArchives.length === 0 &&
      unresolvedTargets.length === 0
    ) {
      addRepositoryFallbacks()
      return createResolution(candidates, transport, {
        strategy: 'bulk',
        requestCount,
        visitedNodes: visitedNodes.size,
        bulkExpandedArchives,
      })
    }

    const queue: QueueItem[] = []
    for (const archive of unexpandedArchives) {
      if (archive.childrenHref !== undefined) {
        queue.push({ path: toRestPath(archive.childrenHref), depth: 1 })
      } else if (archive.metadataHref !== undefined) {
        queue.push({ path: withMetadataFields(archive.metadataHref), depth: 1 })
      }
    }
    for (const target of unresolvedTargets) {
      if (target.metadataHref !== undefined) {
        queue.push({ path: withMetadataFields(target.metadataHref), depth: 1 })
      }
    }
    if (!bulkSucceeded || queue.length === 0) {
      queue.push({ path: createArtifactRootPath(buildId), depth: 0 })
    }

    const concurrency = Math.min(
      Math.max(Math.trunc(options.fallbackConcurrency ?? defaultFallbackConcurrency), 1),
      8,
    )
    const maximumRequests = Math.min(
      Math.max(Math.trunc(options.maximumFallbackRequests ?? defaultMaximumFallbackRequests), 1),
      100,
    )
    let fallbackRequests = 0

    while (queue.length > 0 && candidates.size < 2) {
      if (controller.signal.aborted) {
        throw new TeamCityError('RequestTimeout', 'TeamCity artifact search timed out.')
      }
      if (fallbackRequests >= maximumRequests) {
        throw new TeamCityError(
          'TraversalLimitExceeded',
          'TeamCity artifact fallback request limit was exceeded.',
        )
      }

      const batch: QueueItem[] = []
      while (batch.length < concurrency && queue.length > 0 && fallbackRequests + batch.length < maximumRequests) {
        const item = queue.shift()
        if (item !== undefined && !visitedPaths.has(item.path)) {
          visitedPaths.add(item.path)
          batch.push(item)
        }
      }
      if (batch.length === 0) {
        continue
      }

      fallbackRequests += batch.length
      requestCount += batch.length
      const responses = await Promise.all(
        batch.map(async (item) => ({
          item,
          response: await client.getJson<unknown>(item.path, {
            signal: controller.signal,
            timeoutMs: requestTimeoutMs,
          }),
        })),
      )

      for (const { item, response } of responses) {
        transport = response.transport
        const nodes = flattenNodes(parseArtifactNodes(response.data))
        for (const node of nodes) {
          visitNode(node)
          const nextDepth = item.depth + 1
          if (nextDepth > maximumDepth) {
            throw new TeamCityError(
              'TraversalLimitExceeded',
              'TeamCity artifact traversal depth limit was exceeded.',
            )
          }

          if (node.childrenHref !== undefined) {
            queue.push({ path: toRestPath(node.childrenHref), depth: nextDepth })
          } else if (isBrowsableArchive(node) && node.metadataHref !== undefined) {
            queue.push({ path: withMetadataFields(node.metadataHref), depth: nextDepth })
          }
          if (isTargetArtifact(node, platform) && node.contentHref === undefined && node.metadataHref !== undefined) {
            queue.push({ path: withMetadataFields(node.metadataHref), depth: nextDepth })
          }
        }
      }
    }

    addRepositoryFallbacks()
    return createResolution(candidates, transport, {
      strategy: 'fallback',
      requestCount,
      visitedNodes: visitedNodes.size,
      bulkExpandedArchives,
    })
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new TeamCityError('RequestTimeout', 'TeamCity artifact search timed out.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
