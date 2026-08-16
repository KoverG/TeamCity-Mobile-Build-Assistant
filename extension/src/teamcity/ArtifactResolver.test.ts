import { describe, expect, it } from 'vitest'
import { FakeTeamCityHttpClient } from '../test/FakeTeamCityHttpClient'
import {
  createArtifactBulkPath,
  createArtifactRootPath,
  createRepositoryDownloadPath,
  resolveMobileArtifact,
} from './ArtifactResolver'
import type {
  TeamCityHttpClient,
  TeamCityJsonResult,
  TeamCityRequestOptions,
} from './TeamCityTransport'

function metadataPath(href: string): string {
  const fields =
    'name,fullName,size,href,content(href),children(count,href,file(name,fullName,size,href,content(href),children(count,href)))'
  const url = new URL(href, window.location.origin)
  url.searchParams.set('fields', fields)
  return `${url.pathname}${url.search}`
}

describe('resolveMobileArtifact', () => {
  it('builds a root-scoped bulk listing request with minimal fields', () => {
    const path = createArtifactBulkPath('100', 'android')
    const url = new URL(path, window.location.origin)

    expect(url.pathname).toBe('/app/rest/builds/id:100/artifacts')
    expect(url.searchParams.get('basePath')).toBeNull()
    expect(url.searchParams.get('locator')).toBe(
      'recursive:true,browseArchives:true,pattern:**/*.apk',
    )
    expect(url.searchParams.get('fields')).toBe(
      'count,file(name,fullName,size,href,content(href),children(count,href))',
    )
    expect(url.searchParams.get('resolveParameters')).toBe('false')
    expect(url.searchParams.get('logBuildUsage')).toBe('false')
  })

  it('uses a platform-specific IPA pattern for iOS bulk listing', () => {
    const url = new URL(createArtifactBulkPath('100', 'ios'), window.location.origin)

    expect(url.searchParams.get('locator')).toBe(
      'recursive:true,browseArchives:true,pattern:**/*.ipa',
    )
  })

  it('resolves a directly published APK with one bulk request and keeps contentHref', async () => {
    const bulkPath = createArtifactBulkPath('101', 'android')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'mobile.ApK',
                fullName: 'output/mobile.ApK',
                size: '136314880',
                content: { href: '/repository/download/synthetic/mobile.ApK' },
              },
            ],
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '101', 'android')

    expect(result.status).toBe('Resolved')
    expect(result.candidates).toEqual([
      {
        name: 'mobile.ApK',
        fullName: 'output/mobile.ApK',
        contentHref: '/repository/download/synthetic/mobile.ApK',
        size: 136314880,
      },
    ])
    expect(result.diagnostics).toMatchObject({ strategy: 'bulk', requestCount: 1 })
    expect(client.requestedPaths).toEqual([bulkPath])
  })

  it('builds a repository download fallback when TeamCity omits contentHref', async () => {
    const bulkPath = createArtifactBulkPath('111', 'android')
    const metadataHref = '/app/rest/builds/id:111/artifacts/metadata/package.nupkg%21/apk/mobile.apk'
    const targetMetadataPath = metadataPath(metadataHref)
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'mobile.apk',
                fullName: 'package.nupkg!/apk/mobile.apk',
                href: metadataHref,
              },
            ],
          },
        ],
        [
          targetMetadataPath,
          {
            name: 'mobile.apk',
            fullName: 'package.nupkg!/apk/mobile.apk',
            href: metadataHref,
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '111', 'android', {
      buildTypeId: 'Synthetic_Mobile_Android',
    })

    expect(result.status).toBe('Resolved')
    expect(result.candidates[0]?.contentHref).toBe(
      '/repository/download/Synthetic_Mobile_Android/111:id/package.nupkg!/apk/mobile.apk',
    )
  })

  it('encodes repository path segments while preserving archive traversal semantics', () => {
    expect(
      createRepositoryDownloadPath(
        'Synthetic_Mobile_iOS',
        '112',
        'package.nupkg!/Payload/Synthetic App.ipa',
      ),
    ).toBe(
      '/repository/download/Synthetic_Mobile_iOS/112:id/package.nupkg!/Payload/Synthetic%20App.ipa',
    )
  })

  it('finds an IPA inside an archive when bulk listing exposes !/ paths', async () => {
    const bulkPath = createArtifactBulkPath('202', 'ios')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'mobile.nupkg',
                fullName: 'mobile.nupkg',
                href: '/app/rest/builds/id:202/artifacts/metadata/mobile.nupkg',
              },
              {
                name: 'Mobile.IPA',
                fullName: 'mobile.nupkg!/Payload/Mobile.IPA',
                content: {
                  href: '/app/rest/builds/id:202/artifacts/content/mobile.nupkg%21/Payload/Mobile.IPA',
                },
              },
            ],
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '202', 'ios')

    expect(result.status).toBe('Resolved')
    expect(result.candidates[0]?.fullName).toBe('mobile.nupkg!/Payload/Mobile.IPA')
    expect(result.diagnostics).toEqual({
      strategy: 'bulk',
      requestCount: 1,
      visitedNodes: 2,
      bulkExpandedArchives: true,
    })
  })

  it('uses bounded metadata fallback when bulk listing does not expand an archive', async () => {
    const bulkPath = createArtifactBulkPath('212', 'android')
    const metadataHref = '/app/rest/builds/id:212/artifacts/metadata/mobile.nupkg'
    const archiveMetadataPath = metadataPath(metadataHref)
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'mobile.nupkg',
                fullName: 'mobile.nupkg',
                href: metadataHref,
                content: { href: '/app/rest/builds/id:212/artifacts/content/mobile.nupkg' },
              },
            ],
          },
        ],
        [
          archiveMetadataPath,
          {
            name: 'mobile.nupkg',
            fullName: 'mobile.nupkg',
            href: metadataHref,
            children: {
              file: [
                {
                  name: 'mobile.apk',
                  fullName: 'mobile.nupkg!/apk/mobile.apk',
                  content: {
                    href: '/app/rest/builds/id:212/artifacts/content/mobile.nupkg%21/apk/mobile.apk',
                  },
                },
              ],
            },
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '212', 'android')

    expect(result.status).toBe('Resolved')
    expect(result.diagnostics).toMatchObject({ strategy: 'fallback', requestCount: 2 })
    expect(client.requestedPaths).toEqual([bulkPath, archiveMetadataPath])
    expect(client.requestedTimeouts).toEqual([30_000, 30_000])
  })

  it('falls back from an empty targeted bulk response and finds an APK in an archive', async () => {
    const bulkPath = createArtifactBulkPath('222', 'android')
    const rootPath = createArtifactRootPath('222')
    const archiveChildrenPath =
      '/app/rest/builds/id:222/artifacts/children/package.nupkg'
    const client = new FakeTeamCityHttpClient(
      new Map([
        [bulkPath, { file: [] }],
        [
          rootPath,
          {
            file: [
              {
                name: 'package.nupkg',
                fullName: 'package.nupkg',
                href: '/app/rest/builds/id:222/artifacts/metadata/package.nupkg',
                children: { count: 1, href: archiveChildrenPath },
              },
            ],
          },
        ],
        [
          archiveChildrenPath,
          {
            file: [
              {
                name: 'mobile.APK',
                fullName: 'package.nupkg!/apk/mobile.APK',
                content: {
                  href: '/app/rest/builds/id:222/artifacts/content/package.nupkg%21/apk/mobile.APK',
                },
              },
            ],
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '222', 'android')

    expect(result.status).toBe('Resolved')
    expect(result.candidates[0]?.fullName).toBe('package.nupkg!/apk/mobile.APK')
    expect(result.diagnostics).toMatchObject({ strategy: 'fallback', requestCount: 3 })
    expect(client.requestedPaths).toEqual([bulkPath, rootPath, archiveChildrenPath])
    expect(client.requestedTimeouts).toEqual([30_000, 30_000, 30_000])
  })

  it('returns NotFound when the bulk listing has no target file', async () => {
    const bulkPath = createArtifactBulkPath('303', 'android')
    const rootPath = createArtifactRootPath('303')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [bulkPath, { file: [] }],
        [rootPath, { file: [{ name: 'notes.txt', fullName: 'notes.txt' }] }],
      ]),
    )

    const result = await resolveMobileArtifact(client, '303', 'android')

    expect(result.status).toBe('NotFound')
    expect(result.diagnostics.requestCount).toBe(2)
  })

  it('falls back to finite safety limits for non-finite numeric options', async () => {
    const bulkPath = createArtifactBulkPath('313', 'android')
    const rootPath = createArtifactRootPath('313')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [bulkPath, { file: [] }],
        [rootPath, { file: [{ name: 'notes.txt', fullName: 'notes.txt' }] }],
      ]),
    )

    const result = await resolveMobileArtifact(client, '313', 'android', {
      timeoutMs: Number.NaN,
      requestTimeoutMs: Number.NaN,
      fallbackConcurrency: Number.NaN,
      maximumFallbackRequests: Number.NaN,
    })

    expect(result.status).toBe('NotFound')
    expect(client.requestedPaths).toEqual([bulkPath, rootPath])
    expect(client.requestedTimeouts).toEqual([30_000, 30_000])
  })

  it('marks two target files as Ambiguous without selecting either one', async () => {
    const bulkPath = createArtifactBulkPath('404', 'android')
    const client = new FakeTeamCityHttpClient(
      new Map([
        [
          bulkPath,
          {
            file: [
              {
                name: 'one.apk',
                fullName: 'one.apk',
                content: { href: '/repository/download/synthetic/one.apk' },
              },
              {
                name: 'two.APK',
                fullName: 'two.APK',
                content: { href: '/repository/download/synthetic/two.APK' },
              },
            ],
          },
        ],
      ]),
    )

    const result = await resolveMobileArtifact(client, '404', 'android')

    expect(result.status).toBe('Ambiguous')
    expect(result.candidates).toHaveLength(2)
  })

  it('handles a large synthetic listing in one request', async () => {
    const bulkPath = createArtifactBulkPath('505', 'android')
    const files = Array.from({ length: 1_500 }, (_, index) => ({
      name: `synthetic-${index}.txt`,
      fullName: `results/synthetic-${index}.txt`,
    }))
    files.push({
      name: 'mobile.apk',
      fullName: 'results/mobile.apk',
      content: { href: '/repository/download/synthetic/mobile.apk' },
    } as (typeof files)[number])
    const client = new FakeTeamCityHttpClient(new Map([[bulkPath, { file: files }]]))

    const result = await resolveMobileArtifact(client, '505', 'android')

    expect(result.status).toBe('Resolved')
    expect(result.diagnostics).toMatchObject({ strategy: 'bulk', requestCount: 1 })
    expect(client.requestedPaths).toHaveLength(1)
  })

  it('aborts a stalled request with a stable timeout error', async () => {
    const stalledClient: TeamCityHttpClient = {
      async getJson<T>(
        _path: string,
        options: TeamCityRequestOptions = {},
      ): Promise<TeamCityJsonResult<T>> {
        return await new Promise<TeamCityJsonResult<T>>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true },
          )
        })
      },
    }

    await expect(
      resolveMobileArtifact(stalledClient, '606', 'android', { timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'RequestTimeout' })
  })
})
