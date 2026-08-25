import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  normalizeBuildSearchQuery,
  type BuildSearchMode,
} from '../../teamcity/BuildSearch'
import {
  searchBuildArtifacts,
  type BuildArtifactMatch,
  type BuildArtifactSearchConfiguration,
  type BuildArtifactSearchResult,
} from '../../teamcity/BuildArtifactSearch'
import {
  classifyBuildConfigurations,
  mobileEnvironments,
  type BuildConfigurationClassifier,
  type ClassifiedBuildConfiguration,
  type MobileEnvironment,
} from '../../teamcity/BuildConfigurationClassifier'
import type { TeamCityService } from '../../teamcity/TeamCityService'
import { getSafeTeamCityErrorMessage } from '../../teamcity/TeamCityErrorMessage'
import {
  withRememberedQuery,
  type SearchHistory,
  type SearchHistoryStorage,
} from '../../storage/SearchHistoryStorage'
import {
  useBuildSearchOptions,
  type BuildSearchOptionsConfiguration,
} from './useBuildSearchOptions'
export type AssistantPlatformFilter = BuildArtifactSearchConfiguration['platform']
const assistantPlatformFilters = ['android', 'ios', 'other'] as const


type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AssistantState {
  catalogStatus: CatalogStatus
  searchStatus: SearchStatus
  configurations: ClassifiedBuildConfiguration[]
  sessionUserId: string
  selectedProjectId: string
  selectedPlatforms: AssistantPlatformFilter[]
  selectedEnvironments: MobileEnvironment[]
  searchMode: BuildSearchMode
  searchQueries: Record<BuildSearchMode, string>
  appliedSearch: AssistantSearchParameters
  searchHistory: SearchHistory
  matches: BuildArtifactMatch[]
  selectedBuildIds: ReadonlySet<string>
  catalogErrorMessage?: string
  catalogWarningMessage?: string
  searchErrorMessage?: string
  searchWarningMessage?: string
  hasSearched: boolean
}

type AssistantAction =
  | { type: 'catalog-loading' }
  | {
      type: 'catalog-ready'
      configurations: ClassifiedBuildConfiguration[]
      draft: AssistantSearchParameters
      appliedSearch: AssistantSearchParameters
      sessionUserId: string
      searchHistory: SearchHistory
      warningMessage?: string
    }
  | { type: 'catalog-error'; message: string }
  | { type: 'select-project'; projectId: string }
  | { type: 'toggle-platform'; platform: AssistantPlatformFilter }
  | { type: 'toggle-environment'; environment: MobileEnvironment }
  | { type: 'select-search-mode'; mode: BuildSearchMode }
  | { type: 'set-search-query'; mode: BuildSearchMode; query: string }
  | { type: 'search-loading'; appliedSearch: AssistantSearchParameters }
  | { type: 'search-progress'; matches: BuildArtifactMatch[]; warningMessage?: string }
  | { type: 'search-ready'; matches: BuildArtifactMatch[]; warningMessage?: string }
  | { type: 'search-stopped' }
  | { type: 'search-discarded' }
  | { type: 'search-error'; message: string }
  | { type: 'remember-query'; history: SearchHistory }
  | { type: 'clear-history'; mode: BuildSearchMode }
  | { type: 'toggle-build'; buildId: string }
  | { type: 'reset-session' }

interface AssistantSelection {
  projectId: string
  platforms: AssistantPlatformFilter[]
  environments: MobileEnvironment[]
}

interface AssistantSearchParameters extends AssistantSelection {
  searchMode: BuildSearchMode
  queries: Record<BuildSearchMode, string>
}

interface AssistantControllerOptions {
  service: TeamCityService
  classifier: BuildConfigurationClassifier
  historyStorage: SearchHistoryStorage
  origin: string
}

export interface ProjectOption {
  id: string
  name: string
}

export interface AssistantController {
  state: AssistantState
  projects: ProjectOption[]
  environments: MobileEnvironment[]
  buildSearchOptions: string[]
  buildSearchOptionsErrorMessage?: string
  buildSearchOptionsStatus: ReturnType<typeof useBuildSearchOptions>['status']
  hasOtherConfigurations: boolean
  canSearch: boolean
  loadCatalog(): Promise<void>
  selectProject(projectId: string): void
  togglePlatform(platform: AssistantPlatformFilter): void
  toggleEnvironment(environment: MobileEnvironment): void
  selectSearchMode(mode: BuildSearchMode): void
  setSearchQuery(mode: BuildSearchMode, query: string): void
  clearSearchHistory(mode: BuildSearchMode): void
  resetSession(): void
  refreshBuildSearchOptions(): void
  search(): Promise<boolean>
  stopSearch(): void
  stopBuildSearchOptions(): void
  toggleBuild(buildId: string): void
}

function emptySearchParameters(): AssistantSearchParameters {
  return {
    projectId: '',
    platforms: [],
    environments: [],
    searchMode: 'task',
    queries: { task: '', build: '' },
  }
}

function createInitialState(
  searchHistory: SearchHistory = { task: [], build: [] },
): AssistantState {
  return {
    catalogStatus: 'idle',
    searchStatus: 'idle',
    configurations: [],
    selectedProjectId: '',
    selectedPlatforms: [],
    sessionUserId: '',
    selectedEnvironments: [],
    searchMode: 'task',
    searchQueries: { task: '', build: '' },
    appliedSearch: emptySearchParameters(),
    searchHistory,
    matches: [],
    selectedBuildIds: new Set(),
    hasSearched: false,
  }
}

const initialState = createInitialState()

function reducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case 'catalog-loading':
      return {
        ...state,
        catalogStatus: 'loading',
        catalogErrorMessage: undefined,
        catalogWarningMessage: undefined,
      }
    case 'catalog-ready':
      return {
        ...state,
        catalogStatus: 'ready',
        configurations: action.configurations,
        sessionUserId: action.sessionUserId,
        selectedProjectId: action.draft.projectId,
        selectedPlatforms: action.draft.platforms,
        selectedEnvironments: action.draft.environments,
        searchMode: action.draft.searchMode,
        searchQueries: action.draft.queries,
        appliedSearch: action.appliedSearch,
        searchHistory: action.searchHistory,
        catalogErrorMessage: undefined,
        catalogWarningMessage: action.warningMessage,
      }
    case 'catalog-error':
      return {
        ...state,
        catalogStatus: 'error',
        catalogErrorMessage: action.message,
        catalogWarningMessage: undefined,
      }
    case 'select-project':
      return {
        ...state,
        selectedProjectId: action.projectId,
        selectedPlatforms: [],
        selectedEnvironments: [],
        searchQueries: { task: '', build: '' },
      }
    case 'toggle-platform': {
      const selectedPlatforms = state.selectedPlatforms.includes(action.platform)
        ? state.selectedPlatforms.filter((platform) => platform !== action.platform)
        : [...state.selectedPlatforms, action.platform]
      return {
        ...state,
        selectedPlatforms,
      }
    }
    case 'toggle-environment': {
      const selectedEnvironments = state.selectedEnvironments.includes(action.environment)
        ? state.selectedEnvironments.filter((environment) => environment !== action.environment)
        : [...state.selectedEnvironments, action.environment]
      return {
        ...state,
        selectedEnvironments,
      }
    }
    case 'select-search-mode':
      return { ...state, searchMode: action.mode }
    case 'set-search-query':
      return {
        ...state,
        searchQueries: {
          ...state.searchQueries,
          [action.mode]: normalizeBuildSearchQuery(action.query),
        },
      }
    case 'search-loading':
      return {
        ...state,
        searchStatus: 'loading',
        appliedSearch: action.appliedSearch,
        matches: [],
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
        searchWarningMessage: undefined,
        hasSearched: true,
      }
    case 'search-progress':
      return {
        ...state,
        matches: action.matches,
        searchWarningMessage: action.warningMessage,
      }
    case 'search-ready':
      return {
        ...state,
        searchStatus: 'ready',
        matches: action.matches,
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
        searchWarningMessage: action.warningMessage,
        hasSearched: true,
      }
    case 'search-stopped':
      return {
        ...state,
        searchStatus: 'ready',
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
        hasSearched: true,
      }
    case 'search-discarded':
      return {
        ...state,
        searchStatus: 'ready',
        matches: [],
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
        searchWarningMessage: undefined,
        hasSearched: true,
      }
    case 'remember-query':
      return { ...state, searchHistory: action.history }
    case 'clear-history':
      return {
        ...state,
        searchHistory: { ...state.searchHistory, [action.mode]: [] },
      }
    case 'search-error':
      return {
        ...state,
        searchStatus: 'error',
        matches: [],
        selectedBuildIds: new Set(),
        searchErrorMessage: action.message,
        searchWarningMessage: undefined,
        hasSearched: true,
      }
    case 'toggle-build': {
      const selectedBuildIds = new Set(state.selectedBuildIds)
      if (selectedBuildIds.has(action.buildId)) {
        selectedBuildIds.delete(action.buildId)
      } else {
        selectedBuildIds.add(action.buildId)
      }
      return { ...state, selectedBuildIds }
    }
    case 'reset-session':
      return createInitialState(state.searchHistory)
  }
}

function getSearchWarningMessage(result: BuildArtifactSearchResult): string | undefined {
  const messages: string[] = []
  if (result.failedConfigurations > 0) {
    messages.push(
      `Результаты могут быть неполными: не удалось загрузить конфигураций — ${result.failedConfigurations}.`,
    )
  }
  if (result.failedBuilds > 0) {
    messages.push(
      `Результаты неполные: не удалось проверить ${result.failedBuilds} из ${result.checkedBuilds} сборок.`,
    )
  }
  if (result.ambiguousBuilds > 0) {
    messages.push(
      `Неоднозначные результаты: несколько подходящих артефактов найдено в ${result.ambiguousBuilds} из ${result.checkedBuilds} проверок.`,
    )
  }
  if (result.failedBuildPages > 0) {
    messages.push('Результаты неполные: TeamCity не отдал следующую страницу сборок.')
  }
  return messages.length === 0 ? undefined : messages.join(' ')
}

function getCatalogWarningMessage(skippedConfigurations: number): string | undefined {
  return skippedConfigurations > 0
    ? `Каталог загружен не полностью: пропущено конфигураций — ${skippedConfigurations}.`
    : undefined
}

function projectsFrom(configurations: readonly ClassifiedBuildConfiguration[]): ProjectOption[] {
  const projects = new Map<string, ProjectOption>()
  for (const configuration of configurations) {
    const [rootName] = configuration.projectName.split('/')
    projects.set(configuration.projectId, {
      id: configuration.projectId,
      name: rootName?.trim() || configuration.projectName.trim(),
    })
  }
  return [...projects.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function platformFilterFor(
  configuration: ClassifiedBuildConfiguration,
): AssistantPlatformFilter {
  if (configuration.os === 'Android') {
    return 'android'
  }
  if (configuration.os === 'iOS') {
    return 'ios'
  }
  return 'other'
}
function platformOptions(
  configurations: readonly ClassifiedBuildConfiguration[],
  projectId: string,
): AssistantPlatformFilter[] {
  return assistantPlatformFilters.filter((platform) =>
    configurations.some((configuration) =>
      configuration.projectId === projectId &&
      !configuration.paused &&
      platformFilterFor(configuration) === platform,
    ),
  )
}

function environmentOptions(
  configurations: readonly ClassifiedBuildConfiguration[],
  projectId: string,
): MobileEnvironment[] {
  return mobileEnvironments.filter((environment) =>
    environment !== 'Unclassified' && configurations.some((configuration) =>
      configuration.projectId === projectId &&
      configuration.environment === environment,
    ),
  )
}

function resolvedSelection(
  configurations: readonly ClassifiedBuildConfiguration[],
  current: AssistantSelection,
): AssistantSelection {
  const projects = projectsFrom(configurations)
  const projectId = projects.some((project) => project.id === current.projectId)
    ? current.projectId
    : ''
  const availablePlatforms = platformOptions(configurations, projectId)
  const platforms = current.projectId === projectId
    ? current.platforms.filter((platform) => availablePlatforms.includes(platform))
    : []
  const environments = environmentOptions(configurations, projectId)
  const preferredEnvironments = current.projectId === projectId
    ? current.environments
    : []

  return {
    projectId,
    platforms,
    environments: preferredEnvironments.filter((environment) => environments.includes(environment)),
  }
}

function parametersFromState(state: AssistantState): AssistantSearchParameters {
  return {
    projectId: state.selectedProjectId,
    platforms: state.selectedPlatforms,
    environments: state.selectedEnvironments,
    searchMode: state.searchMode,
    queries: state.searchQueries,
  }
}

function resolvedParameters(
  configurations: readonly ClassifiedBuildConfiguration[],
  preferred: AssistantSearchParameters,
): AssistantSearchParameters {
  const filters = resolvedSelection(configurations, preferred)
  return {
    ...filters,
    searchMode: preferred.searchMode,
    queries: preferred.queries,
  }
}

export function useAssistantController({
  service,
  classifier,
  historyStorage,
  origin,
}: AssistantControllerOptions): AssistantController {
  const [state, dispatch] = useReducer(reducer, initialState)
  const catalogRequestRef = useRef(0)
  const searchRequestRef = useRef(0)
  const searchAbortRef = useRef<AbortController | undefined>(undefined)
  const restoreStoredHistoryRef = useRef(true)
  const buildSearchOptionsController = useBuildSearchOptions(service)
  const deactivateBuildSearchOptions = buildSearchOptionsController.deactivate

  const projects = useMemo(
    () => projectsFrom(state.configurations),
    [state.configurations],
  )
  const environments = useMemo(
    () => environmentOptions(state.configurations, state.selectedProjectId),
    [state.configurations, state.selectedProjectId],
  )
  const hasOtherConfigurations = state.configurations.some((configuration) =>
    configuration.projectId === state.selectedProjectId &&
    configuration.os === 'Unclassified' &&
    !configuration.paused,
  )
  const searchableConfigurations = useMemo(() => {
    const selectedPlatforms = new Set(state.selectedPlatforms)
    const selectedEnvironments = new Set(state.selectedEnvironments)
    return state.configurations.filter((configuration) =>
      configuration.projectId === state.selectedProjectId &&
      !configuration.paused &&
      (selectedPlatforms.size === 0 ||
        selectedPlatforms.has(platformFilterFor(configuration))) &&
      (selectedEnvironments.size === 0 ||
        selectedEnvironments.has(configuration.environment)),
    )
  }, [
    state.configurations,
    state.selectedEnvironments,
    state.selectedPlatforms,
    state.selectedProjectId,
  ])
  const filteredSearchOptionConfigurations = useMemo<BuildSearchOptionsConfiguration[]>(() =>
    searchableConfigurations.map((configuration) => ({
      id: configuration.id,
      signature: `${configuration.environment}:${configuration.os}`,
    })), [searchableConfigurations])
  const buildSearchOptions = buildSearchOptionsController.values(
    state.searchMode,
    searchableConfigurations.map(({ id }) => id),
    state.searchQueries[state.searchMode],
  )

  useEffect(() => () => {
    catalogRequestRef.current += 1
    searchRequestRef.current += 1
    searchAbortRef.current?.abort()
    searchAbortRef.current = undefined
  }, [])

  async function loadCatalog() {
    const requestId = ++catalogRequestRef.current
    searchRequestRef.current += 1
    const activeSearch = searchAbortRef.current
    searchAbortRef.current = undefined
    activeSearch?.abort()
    buildSearchOptionsController.deactivate()
    const current = state
    if (current.searchStatus === 'loading') {
      dispatch({ type: 'search-discarded' })
    }
    dispatch({ type: 'catalog-loading' })
    try {
      const [result, history] = await Promise.all([
        service.loadCatalog(),
        restoreStoredHistoryRef.current
          ? historyStorage.load(origin).catch(() => ({ task: [], build: [] }))
          : Promise.resolve(current.searchHistory),
      ])
      if (requestId !== catalogRequestRef.current) {
        return
      }
      const configurations = classifyBuildConfigurations(result.configurations, classifier)
      const draft = resolvedParameters(configurations, parametersFromState(current))
      const sessionScope = `${origin}:${result.sessionUserId ?? 'session'}`
      restoreStoredHistoryRef.current = false
      dispatch({
        type: 'catalog-ready',
        configurations,
        draft,
        sessionUserId: result.sessionUserId ?? 'session',
        appliedSearch: resolvedParameters(configurations, current.appliedSearch),
        searchHistory: history,
        warningMessage: getCatalogWarningMessage(result.skippedConfigurations),
      })
      buildSearchOptionsController.activateProject({
        configurations: configurations
          .filter((configuration) =>
            configuration.projectId === draft.projectId && !configuration.paused,
          )
          .map((configuration) => ({
            id: configuration.id,
            signature: `${configuration.environment}:${configuration.os}`,
          })),
        projectId: draft.projectId,
        sessionScope,
      })
    } catch (error) {
      if (requestId === catalogRequestRef.current) {
        dispatch({ type: 'catalog-error', message: getSafeTeamCityErrorMessage(error) })
      }
    }
  }

  async function search(): Promise<boolean> {
    if (searchableConfigurations.length === 0) {
      return false
    }
    const current = parametersFromState(state)
    const normalizedQuery = normalizeBuildSearchQuery(current.queries[current.searchMode])
    const nextHistory = withRememberedQuery(
      state.searchHistory,
      current.searchMode,
      normalizedQuery,
    )
    dispatch({ type: 'remember-query', history: nextHistory })
    void historyStorage.save(origin, nextHistory).catch(() => undefined)
    const appliedSearch: AssistantSearchParameters = {
      ...current,
      queries: {
        ...state.appliedSearch.queries,
        [current.searchMode]: normalizedQuery,
      },
    }
    const requestId = ++searchRequestRef.current
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    dispatch({ type: 'search-loading', appliedSearch })
    const configurations: BuildArtifactSearchConfiguration[] = searchableConfigurations.map(
      (configuration) => ({
        id: configuration.id,
        name: configuration.name,
        platform: platformFilterFor(configuration),
      }),
    )
    try {
      const result = await searchBuildArtifacts(service, configurations, {
        pageSize: 50,
        concurrency: 4,
        query: normalizedQuery.length === 0
          ? undefined
          : { mode: current.searchMode, value: normalizedQuery },
        signal: controller.signal,
        onProgress: (progress) => {
          if (requestId === searchRequestRef.current && !controller.signal.aborted) {
            dispatch({
              type: 'search-progress',
              matches: progress.matches,
              warningMessage: getSearchWarningMessage(progress),
            })
          }
        },
      })
      if (requestId === searchRequestRef.current) {
        dispatch({
          type: 'search-ready',
          matches: result.matches,
          warningMessage: getSearchWarningMessage(result),
        })
        return true
      }
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        dispatch({ type: 'search-error', message: getSafeTeamCityErrorMessage(error) })
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = undefined
      }
    }
    return false
  }

  const stopSearch = useCallback(() => {
    const activeSearch = searchAbortRef.current
    if (activeSearch === undefined) {
      return
    }
    searchRequestRef.current += 1
    searchAbortRef.current = undefined
    activeSearch.abort()
    dispatch({ type: 'search-stopped' })
  }, [])

  const resetSession = useCallback(() => {
    catalogRequestRef.current += 1
    searchRequestRef.current += 1
    searchAbortRef.current?.abort()
    searchAbortRef.current = undefined
    deactivateBuildSearchOptions()
    dispatch({ type: 'reset-session' })
  }, [deactivateBuildSearchOptions])

  function clearSearchHistory(mode: BuildSearchMode) {
    const nextHistory = { ...state.searchHistory, [mode]: [] }
    dispatch({ type: 'clear-history', mode })
    void historyStorage.save(origin, nextHistory).catch(() => undefined)
  }

  function selectProject(projectId: string) {
    buildSearchOptionsController.deactivate()
    dispatch({ type: 'select-project', projectId })
    const configurations = state.configurations
      .filter((configuration) => configuration.projectId === projectId && !configuration.paused)
      .map((configuration) => ({
        id: configuration.id,
        signature: `${configuration.environment}:${configuration.os}`,
      }))
    buildSearchOptionsController.activateProject({
      configurations,
      projectId,
      sessionScope: `${origin}:${state.sessionUserId || 'session'}`,
    })
  }

  function togglePlatform(platform: AssistantPlatformFilter) {
    buildSearchOptionsController.stop()
    dispatch({ type: 'toggle-platform', platform })
  }

  function toggleEnvironment(environment: MobileEnvironment) {
    buildSearchOptionsController.stop()
    dispatch({ type: 'toggle-environment', environment })
  }

  function refreshBuildSearchOptions() {
    buildSearchOptionsController.refresh(filteredSearchOptionConfigurations)
  }

  return {
    state,
    projects,
    environments,
    buildSearchOptions,
    buildSearchOptionsErrorMessage: buildSearchOptionsController.errorMessage,
    buildSearchOptionsStatus: buildSearchOptionsController.status,
    hasOtherConfigurations,
    canSearch: state.catalogStatus === 'ready' && searchableConfigurations.length > 0,
    loadCatalog,
    selectProject,
    togglePlatform,
    toggleEnvironment,
    selectSearchMode: (mode) => dispatch({ type: 'select-search-mode', mode }),
    setSearchQuery: (mode, query) => dispatch({ type: 'set-search-query', mode, query }),
    clearSearchHistory,
    resetSession,
    refreshBuildSearchOptions,
    search,
    stopSearch,
    stopBuildSearchOptions: buildSearchOptionsController.stop,
    toggleBuild: (buildId) => dispatch({ type: 'toggle-build', buildId }),
  }
}
