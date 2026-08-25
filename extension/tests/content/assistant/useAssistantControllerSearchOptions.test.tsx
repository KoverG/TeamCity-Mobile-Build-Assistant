import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BuildConfigurationClassifier } from '../../../src/teamcity/BuildConfigurationClassifier'
import type { TeamCityService } from '../../../src/teamcity/TeamCityService'
import { useAssistantController } from '../../../src/content/assistant/useAssistantController'

function createOptionsService(): TeamCityService {
  return {
    loadCatalog: vi.fn().mockResolvedValue({
      configurations: [
        { id: 'Synthetic_android_stage', name: 'Android Stage', projectId: 'Synthetic', projectName: 'Synthetic', paused: false },
        { id: 'Synthetic_ios_stage', name: 'iOS Stage', projectId: 'Synthetic', projectName: 'Synthetic', paused: false },
        { id: 'Synthetic_android_prod', name: 'Android Production', projectId: 'Synthetic', projectName: 'Synthetic', paused: false },
        { id: 'Synthetic_ios_prod', name: 'iOS Production', projectId: 'Synthetic', projectName: 'Synthetic', paused: false },
        { id: 'Synthetic_paused', name: 'Android Stage Paused', projectId: 'Synthetic', projectName: 'Synthetic', paused: true },
      ],
      sessionUserId: 'synthetic-user',
      skippedConfigurations: 0,
      transport: 'main-world',
    }),
    loadBuilds: vi.fn(async (
      buildTypeIds: readonly string[],
      options?: Parameters<TeamCityService['loadBuilds']>[1],
    ) => {
      if (options?.collectBuilds === false) {
        await options.onPage?.({
          builds: buildTypeIds.map((buildTypeId, index) => ({
            id: `${buildTypeId}-${index}`,
            buildTypeId,
            number: `${100 + index}`,
            branchName: `feature/TEST-${index + 1}-synthetic`,
            defaultBranch: false,
          })),
          transport: 'main-world' as const,
        })
      }
      return { builds: [], failedConfigurations: 0, transport: 'main-world' as const }
    }),
    resolveArtifact: vi.fn(),
  }
}

function renderController(service: TeamCityService) {
  return renderHook(() => useAssistantController({
    service,
    classifier: new BuildConfigurationClassifier(),
    historyStorage: {
      load: vi.fn().mockResolvedValue({ task: [], build: [] }),
      save: vi.fn().mockResolvedValue(undefined),
    },
    origin: 'https://teamcity.example.test',
  }))
}

describe('useAssistantController search options', () => {
  it('loads one project index and filters it locally by multiple environments and platforms', async () => {
    const service = createOptionsService()
    const { result } = renderController(service)
    await act(async () => result.current.loadCatalog())
    act(() => result.current.selectProject('Synthetic'))

    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('ready'))
    const metadataCalls = () => vi.mocked(service.loadBuilds).mock.calls.filter(
      ([, options]) => options?.collectBuilds === false,
    )
    expect(metadataCalls()).toHaveLength(1)
    expect(metadataCalls()[0]?.[0]).toEqual([
      'Synthetic_android_stage',
      'Synthetic_ios_stage',
      'Synthetic_android_prod',
      'Synthetic_ios_prod',
    ])
    expect(metadataCalls()[0]?.[1]).toMatchObject({
      collectBuilds: false,
      maximumPages: 1_000,
      pageSize: 100,
      requestTimeoutMs: 15_000,
    })
    expect(result.current.buildSearchOptions).toEqual(['TEST-1', 'TEST-2', 'TEST-3', 'TEST-4'])

    act(() => result.current.toggleEnvironment('Staging'))
    expect(result.current.buildSearchOptions).toEqual(['TEST-1', 'TEST-2'])
    act(() => result.current.togglePlatform('android'))
    expect(result.current.buildSearchOptions).toEqual(['TEST-1'])
    act(() => result.current.toggleEnvironment('Production'))
    expect(result.current.buildSearchOptions).toEqual(['TEST-1', 'TEST-3'])
    expect(metadataCalls()).toHaveLength(1)

    act(() => result.current.refreshBuildSearchOptions())
    await waitFor(() => expect(metadataCalls()).toHaveLength(2))
    expect(metadataCalls()[1]?.[0]).toEqual([
      'Synthetic_android_stage',
      'Synthetic_android_prod',
    ])
  })

  it('filters the complete in-memory index by the current input without a new request', async () => {
    const service = createOptionsService()
    const { result } = renderController(service)
    await act(async () => result.current.loadCatalog())
    act(() => result.current.selectProject('Synthetic'))
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('ready'))

    act(() => result.current.setSearchQuery('task', '3'))
    expect(result.current.buildSearchOptions).toEqual(['TEST-3'])
    expect(service.loadBuilds).toHaveBeenCalledTimes(1)
  })

  it('keeps a stopped project index partial after refreshing only a filtered subset', async () => {
    const service = createOptionsService()
    let initialMetadataLoad = true
    vi.mocked(service.loadBuilds).mockImplementation(async (
      buildTypeIds: readonly string[],
      options?: Parameters<TeamCityService['loadBuilds']>[1],
    ) => {
      if (options?.collectBuilds === false && initialMetadataLoad) {
        initialMetadataLoad = false
        await new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Synthetic cancellation.', 'AbortError'))
          }, { once: true })
        })
      }
      if (options?.collectBuilds === false) {
        await options.onPage?.({
          builds: buildTypeIds.map((buildTypeId, index) => ({
            id: `${buildTypeId}-refresh-${index}`,
            buildTypeId,
            number: `${200 + index}`,
            branchName: `feature/TEST-${index + 10}-synthetic`,
            defaultBranch: false,
          })),
          transport: 'main-world',
        })
      }
      return { builds: [], failedConfigurations: 0, transport: 'main-world' }
    })
    const { result } = renderController(service)
    await act(async () => result.current.loadCatalog())
    act(() => result.current.selectProject('Synthetic'))
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('loading'))

    act(() => result.current.stopBuildSearchOptions())
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('partial'))
    act(() => {
      result.current.toggleEnvironment('Staging')
      result.current.togglePlatform('android')
    })
    act(() => result.current.refreshBuildSearchOptions())

    await waitFor(() => expect(service.loadBuilds).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('partial'))
    expect(vi.mocked(service.loadBuilds).mock.calls[1]?.[0]).toEqual([
      'Synthetic_android_stage',
    ])
  })
  it('chunks a large project and reloads an index after an interrupted full refresh', async () => {
    const service = createOptionsService()
    const largeConfigurations = Array.from({ length: 45 }, (_, index) => ({
      id: `Synthetic_android_stage_${index}`,
      name: `Android Stage ${index}`,
      projectId: 'Synthetic',
      projectName: 'Synthetic',
      paused: false,
    }))
    vi.mocked(service.loadCatalog).mockResolvedValue({
      configurations: largeConfigurations,
      sessionUserId: 'synthetic-user',
      skippedConfigurations: 0,
      transport: 'main-world',
    })
    let metadataCall = 0
    vi.mocked(service.loadBuilds).mockImplementation(async (
      buildTypeIds: readonly string[],
      options?: Parameters<TeamCityService['loadBuilds']>[1],
    ) => {
      metadataCall += 1
      if (metadataCall === 4) {
        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Synthetic cancellation.', 'AbortError'))
          }, { once: true })
        })
      }
      await options?.onPage?.({
        builds: buildTypeIds.map((buildTypeId, index) => ({
          id: `${buildTypeId}-${metadataCall}-${index}`,
          buildTypeId,
          number: `${metadataCall}00${index}`,
          branchName: `feature/TEST-${metadataCall}00${index}-synthetic`,
          defaultBranch: false,
        })),
        transport: 'main-world',
      })
      return { builds: [], failedConfigurations: 0, transport: 'main-world' }
    })
    const { result } = renderController(service)
    await act(async () => result.current.loadCatalog())
    act(() => result.current.selectProject('Synthetic'))

    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('ready'))
    expect(vi.mocked(service.loadBuilds).mock.calls).toHaveLength(3)
    expect(vi.mocked(service.loadBuilds).mock.calls.flatMap(([ids]) => ids))
      .toEqual(largeConfigurations.map(({ id }) => id))
    expect(vi.mocked(service.loadBuilds).mock.calls.every(([ids]) => ids.length <= 20))
      .toBe(true)

    act(() => result.current.refreshBuildSearchOptions())
    await waitFor(() => expect(vi.mocked(service.loadBuilds).mock.calls.length).toBeGreaterThanOrEqual(5))
    act(() => result.current.stopBuildSearchOptions())
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('partial'))
    const callsBeforeReselect = vi.mocked(service.loadBuilds).mock.calls.length

    act(() => result.current.selectProject(''))
    act(() => result.current.selectProject('Synthetic'))

    await waitFor(() => expect(vi.mocked(service.loadBuilds).mock.calls.length).toBeGreaterThan(callsBeforeReselect))
    await waitFor(() => expect(result.current.buildSearchOptionsStatus).toBe('ready'))
  })
})
