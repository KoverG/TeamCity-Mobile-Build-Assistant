import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuildSearchMode } from '../../teamcity/BuildSearch'
import {
  BuildSearchOptionsCache,
  chunkBuildSearchConfigurations,
  ProjectBuildSearchIndex,
} from '../../teamcity/BuildSearchOptions'
import type { TeamCityService } from '../../teamcity/TeamCityService'
import { TeamCityError } from '../../teamcity/TeamCityError'
import { getSafeTeamCityErrorMessage } from '../../teamcity/TeamCityErrorMessage'

export type BuildSearchOptionsStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error'

const maximumConcurrentBuildSearchOptionChunks = 2
const buildSearchOptionsMaximumPages = 1_000
const buildSearchOptionsOverallTimeoutMs = 120_000
const buildSearchOptionsRequestTimeoutMs = 15_000

export interface BuildSearchOptionsConfiguration {
  id: string
  signature: string
}

interface ProjectSelection {
  configurations: readonly BuildSearchOptionsConfiguration[]
  projectId: string
  sessionScope: string
}

interface ActiveProject extends ProjectSelection {
  index: ProjectBuildSearchIndex
}

interface BuildSearchOptionsState {
  errorMessage?: string
  status: BuildSearchOptionsStatus
  version: number
}

interface BuildSearchOptionsController extends BuildSearchOptionsState {
  activateProject(selection: ProjectSelection): void
  deactivate(): void
  refresh(configurations: readonly BuildSearchOptionsConfiguration[]): void
  stop(): void
  values(mode: BuildSearchMode, buildTypeIds: readonly string[], query: string): string[]
}

function configurationSignature(
  configurations: readonly BuildSearchOptionsConfiguration[],
): string {
  return configurations
    .map(({ id, signature }) => `${id}:${signature}`)
    .sort()
    .join('|')
}

function coversProject(
  projectConfigurations: readonly BuildSearchOptionsConfiguration[],
  refreshedConfigurations: readonly BuildSearchOptionsConfiguration[],
): boolean {
  const refreshedIds = new Set(refreshedConfigurations.map(({ id }) => id))
  return projectConfigurations.every(({ id }) => refreshedIds.has(id))
}

export function useBuildSearchOptions(service: TeamCityService): BuildSearchOptionsController {
  const cacheRef = useRef(new BuildSearchOptionsCache())
  const completedIndexesRef = useRef(new WeakSet<ProjectBuildSearchIndex>())
  const activeProjectRef = useRef<ActiveProject | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const requestRef = useRef(0)
  const [state, setState] = useState<BuildSearchOptionsState>({
    status: 'idle',
    version: 0,
  })

  const stop = useCallback(() => {
    const activeRequest = abortRef.current
    if (activeRequest === undefined) {
      return
    }
    requestRef.current += 1
    abortRef.current = undefined
    activeRequest.abort()
    setState((current) => ({
      status: 'partial',
      version: current.version + 1,
    }))
  }, [])

  const load = useCallback((
    activeProject: ActiveProject,
    configurations: readonly BuildSearchOptionsConfiguration[],
  ) => {
    const buildTypeIds = [...new Set(configurations.map(({ id }) => id))]
    const requestId = ++requestRef.current
    abortRef.current?.abort()
    abortRef.current = undefined

    let configurationChunks: string[][]
    try {
      configurationChunks = chunkBuildSearchConfigurations(buildTypeIds)
    } catch (error) {
      setState((current) => ({
        errorMessage: getSafeTeamCityErrorMessage(error),
        status: 'error',
        version: current.version + 1,
      }))
      return
    }

    const completesProject = coversProject(activeProject.configurations, configurations)
    const wasComplete = completedIndexesRef.current.has(activeProject.index)
    const becomesComplete = completesProject || wasComplete
    completedIndexesRef.current.delete(activeProject.index)
    const controller = new AbortController()
    abortRef.current = controller
    activeProject.index.replaceConfigurations(buildTypeIds)
    setState((current) => ({
      status: configurationChunks.length === 0
        ? (becomesComplete ? 'ready' : 'partial')
        : 'loading',
      version: current.version + 1,
    }))
    if (configurationChunks.length === 0) {
      abortRef.current = undefined
      if (becomesComplete) {
        completedIndexesRef.current.add(activeProject.index)
      }
      return
    }

    let timedOut = false
    const operationTimeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, buildSearchOptionsOverallTimeoutMs)
    let nextChunkIndex = 0
    const loadNextChunk = async () => {
      while (nextChunkIndex < configurationChunks.length) {
        const chunk = configurationChunks[nextChunkIndex]
        nextChunkIndex += 1
        if (chunk === undefined) {
          return
        }
        await service.loadBuilds(chunk, {
          collectBuilds: false,
          maximumPages: buildSearchOptionsMaximumPages,
          pageSize: 100,
          requestTimeoutMs: buildSearchOptionsRequestTimeoutMs,
          signal: controller.signal,
          onPage: ({ builds }) => {
            if (requestId === requestRef.current && !controller.signal.aborted) {
              activeProject.index.addBuilds(builds)
              setState((current) => ({
                status: 'loading',
                version: current.version + 1,
              }))
            }
          },
        })
      }
    }

    void Promise.all(
      Array.from(
        { length: Math.min(maximumConcurrentBuildSearchOptionChunks, configurationChunks.length) },
        () => loadNextChunk(),
      ),
    ).then(() => {
      if (requestId === requestRef.current && !controller.signal.aborted) {
        if (becomesComplete) {
          completedIndexesRef.current.add(activeProject.index)
        }
        setState((current) => ({
          status: completedIndexesRef.current.has(activeProject.index)
            ? 'ready'
            : 'partial',
          version: current.version + 1,
        }))
      }
    }).catch((error: unknown) => {
      if (requestId !== requestRef.current) {
        return
      }
      const reportedError = timedOut
        ? new TeamCityError('RequestTimeout', 'TeamCity build metadata loading timed out.')
        : error
      if (controller.signal.aborted && !timedOut) {
        return
      }
      controller.abort()
      if (
        reportedError instanceof TeamCityError &&
        (reportedError.code === 'NotAuthenticated' || reportedError.code === 'Forbidden')
      ) {
        cacheRef.current.clear()
      }
      setState((current) => ({
        errorMessage: getSafeTeamCityErrorMessage(reportedError),
        status: 'error',
        version: current.version + 1,
      }))
    }).finally(() => {
      window.clearTimeout(operationTimeout)
      if (abortRef.current === controller) {
        abortRef.current = undefined
      }
    })
  }, [service])

  const activateProject = useCallback((selection: ProjectSelection) => {
    stop()
    if (selection.projectId.length === 0) {
      activeProjectRef.current = undefined
      setState((current) => ({ status: 'idle', version: current.version + 1 }))
      return
    }

    const index = cacheRef.current.getOrCreate(
      selection.sessionScope,
      selection.projectId,
      configurationSignature(selection.configurations),
    )
    const activeProject = { ...selection, index }
    activeProjectRef.current = activeProject
    if (completedIndexesRef.current.has(index)) {
      setState((current) => ({ status: 'ready', version: current.version + 1 }))
      return
    }
    load(activeProject, selection.configurations)
  }, [load, stop])

  const refresh = useCallback((configurations: readonly BuildSearchOptionsConfiguration[]) => {
    const activeProject = activeProjectRef.current
    if (activeProject !== undefined) {
      load(activeProject, configurations)
    }
  }, [load])

  const deactivate = useCallback(() => {
    stop()
    activeProjectRef.current = undefined
    setState((current) => ({ status: 'idle', version: current.version + 1 }))
  }, [stop])

  const values = useCallback((
    mode: BuildSearchMode,
    buildTypeIds: readonly string[],
    query: string,
  ) => activeProjectRef.current?.index.values(mode, buildTypeIds, query) ?? [], [])

  useEffect(() => {
    const pruneInterval = window.setInterval(() => cacheRef.current.prune(), 60_000)
    return () => {
      window.clearInterval(pruneInterval)
      requestRef.current += 1
      abortRef.current?.abort()
      abortRef.current = undefined
    }
  }, [])

  return {
    ...state,
    activateProject,
    deactivate,
    refresh,
    stop,
    values,
  }
}
