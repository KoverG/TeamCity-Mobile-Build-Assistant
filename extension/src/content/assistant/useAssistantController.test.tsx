import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BuildConfigurationClassifier } from '../../teamcity/BuildConfigurationClassifier'
import type { TeamCityService } from '../../teamcity/TeamCityService'
import { useAssistantController } from './useAssistantController'

describe('useAssistantController', () => {
  it('cancels an active search before refreshing the catalog', async () => {
    let finishLoading: ((value: Awaited<ReturnType<TeamCityService['loadBuilds']>>) => void) | undefined
    const service: TeamCityService = {
      loadCatalog: vi.fn().mockResolvedValue({
        configurations: [{
          id: 'Synthetic_Mobile_android_stage',
          name: 'Android Stage',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile',
          paused: false,
        }],
        transport: 'main-world',
      }),
      loadBuilds: vi.fn().mockImplementation(() => new Promise((resolve) => {
        finishLoading = resolve
      })),
      resolveArtifact: vi.fn(),
    }
    const { result } = renderHook(() => useAssistantController({
      service,
      classifier: new BuildConfigurationClassifier(),
      historyStorage: {
        load: vi.fn().mockResolvedValue({ task: [], build: [] }),
        save: vi.fn().mockResolvedValue(undefined),
      },
      origin: 'https://teamcity.example.test',
    }))

    await act(async () => result.current.loadCatalog())
    act(() => result.current.selectProject('Synthetic_Mobile'))
    await waitFor(() => expect(result.current.canSearch).toBe(true))

    let searchPromise: Promise<boolean> | undefined
    act(() => {
      searchPromise = result.current.search()
    })
    await waitFor(() => expect(result.current.state.searchStatus).toBe('loading'))

    await act(async () => result.current.loadCatalog())

    expect(service.loadCatalog).toHaveBeenCalledTimes(2)
    expect(result.current.state.searchStatus).toBe('ready')
    expect(result.current.state.hasSearched).toBe(true)
    expect(result.current.state.matches).toEqual([])
    expect(vi.mocked(service.loadBuilds).mock.calls[0]?.[1]?.signal).toHaveProperty('aborted', true)

    await act(async () => {
      finishLoading?.({ builds: [], transport: 'main-world' })
      await searchPromise
    })
  })
})
