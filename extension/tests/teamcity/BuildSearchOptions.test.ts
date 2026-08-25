import { describe, expect, it } from 'vitest'
import {
  BuildSearchOptionsCache,
  extractTaskIdentifier,
  chunkBuildSearchConfigurations,
  maximumBuildSearchConfigurationChunkSize,
  maximumBuildSearchLocatorLength,
  ProjectBuildSearchIndex,
} from '../../src/teamcity/BuildSearchOptions'
import { createSuccessfulBuildsPath, type TeamCityBuild } from '../../src/teamcity/BuildFinder'

function build(
  id: string,
  buildTypeId: string,
  number: string,
  branchName?: string,
): TeamCityBuild {
  return {
    id,
    buildTypeId,
    number,
    branchName,
    defaultBranch: false,
  }
}

describe('BuildSearchOptions', () => {
  it.each([
    ['feature/TEST-1111-description', 'TEST-1111'],
    ['bugfix/mobile-42-details', 'mobile-42'],
    ['task/9876-description', '9876'],
    ['refs/heads/hotfix_314', '314'],
    ['main', undefined],
    [undefined, undefined],
  ])('extracts a synthetic task identifier from %s', (branchName, expected) => {
    expect(extractTaskIdentifier(branchName)).toBe(expected)
  })

  it('preserves TeamCity order and deduplicates tasks without case sensitivity', () => {
    const index = new ProjectBuildSearchIndex()
    index.addBuilds([
      build('1', 'Synthetic_Android', '100', 'feature/TEST-1111-first'),
      build('2', 'Synthetic_iOS', '101', 'feature/test-1111-second'),
      build('3', 'Synthetic_iOS', '102', 'feature/APP-2222'),
    ])

    expect(index.values('task', ['Synthetic_Android', 'Synthetic_iOS'])).toEqual([
      'TEST-1111',
      'APP-2222',
    ])
    expect(index.values('task', ['Synthetic_Android', 'Synthetic_iOS'], '1111')).toEqual([
      'TEST-1111',
    ])
  })

  it('filters by selected configurations and keeps build-number identity case-sensitive', () => {
    const index = new ProjectBuildSearchIndex()
    index.addBuilds([
      build('1', 'Synthetic_Android', 'Release-10'),
      build('2', 'Synthetic_iOS', 'release-10'),
      build('3', 'Synthetic_iOS', '20'),
    ])

    expect(index.values('build', ['Synthetic_iOS'])).toEqual(['release-10', '20'])
    expect(index.values('build', ['Synthetic_Android', 'Synthetic_iOS'], 'release')).toEqual([
      'Release-10',
      'release-10',
    ])
  })

  it('replaces only refreshed configuration buckets and limits the visual list', () => {
    const index = new ProjectBuildSearchIndex()
    index.addBuilds(Array.from({ length: 55 }, (_, item) =>
      build(String(item), 'Synthetic_Android', String(item)),
    ))
    index.addBuilds([build('ios-1', 'Synthetic_iOS', 'ios-old')])

    expect(index.values('build', ['Synthetic_Android'])).toHaveLength(50)
    index.replaceConfigurations(['Synthetic_iOS'])
    index.addBuilds([build('ios-2', 'Synthetic_iOS', 'ios-new')])

    expect(index.values('build', ['Synthetic_iOS'])).toEqual(['ios-new'])
    expect(index.values('build', ['Synthetic_Android'], '', 100)).toHaveLength(55)
  })

  it('chunks large configuration sets by count and encoded locator length', () => {
    const buildTypeIds = Array.from(
      { length: 45 },
      (_, index) => `Synthetic_${index}_${'x'.repeat(80)}`,
    )

    const chunks = chunkBuildSearchConfigurations(buildTypeIds)

    expect(chunks.flat()).toEqual(buildTypeIds)
    expect(chunks.every((chunk) =>
      chunk.length <= maximumBuildSearchConfigurationChunkSize &&
      createSuccessfulBuildsPath(chunk, 100).length <= maximumBuildSearchLocatorLength,
    )).toBe(true)
    expect(chunks.some((chunk) => chunk.length < maximumBuildSearchConfigurationChunkSize))
      .toBe(true)
  })

  it('clears cached project indexes immediately when the authenticated scope changes', () => {
    const cache = new BuildSearchOptionsCache()
    const firstUserIndex = cache.getOrCreate('user-a', 'project', 'signature', 0)

    cache.getOrCreate('user-b', 'project', 'signature', 1)

    expect(cache.getOrCreate('user-a', 'project', 'signature', 2)).not.toBe(firstUserIndex)
  })
  it('expires idle entries, invalidates changed catalogs, and evicts least-recent projects', () => {
    const cache = new BuildSearchOptionsCache(2, 100)
    const first = cache.getOrCreate('user', 'project-1', 'a', 0)
    const second = cache.getOrCreate('user', 'project-2', 'b', 10)
    expect(cache.getOrCreate('user', 'project-1', 'a', 20)).toBe(first)

    cache.getOrCreate('user', 'project-3', 'c', 30)
    expect(cache.getOrCreate('user', 'project-2', 'b', 31)).not.toBe(second)
    expect(cache.getOrCreate('user', 'project-1', 'changed', 40)).not.toBe(first)

    const expiring = cache.getOrCreate('user', 'project-4', 'd', 50)
    expect(cache.getOrCreate('user', 'project-4', 'd', 150)).not.toBe(expiring)
  })

  it('prunes expired entries without waiting for the next project access', () => {
    const cache = new BuildSearchOptionsCache(3, 100)
    const expired = cache.getOrCreate('user', 'project', 'signature', 0)

    cache.prune(100)

    expect(cache.getOrCreate('user', 'project', 'signature', 100)).not.toBe(expired)
  })
})
