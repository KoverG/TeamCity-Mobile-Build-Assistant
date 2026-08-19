import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { MobilePlatform } from '../../teamcity/ArtifactResolver'
import {
  normalizeBuildSearchQuery,
  type BuildSearchMode,
} from '../../teamcity/BuildSearch'
import {
  searchBuildArtifacts,
  type BuildArtifactMatch,
  type BuildArtifactSearchConfiguration,
} from '../../teamcity/BuildArtifactSearch'
import {
  classifyBuildConfigurations,
  mobileEnvironments,
  type BuildConfigurationClassifier,
  type ClassifiedBuildConfiguration,
  type MobileEnvironment,
} from '../../teamcity/BuildConfigurationClassifier'
import type { TeamCityService } from '../../teamcity/TeamCityService'
import { TeamCityError } from '../../teamcity/TeamCityError'
import type {
  RememberedSelection,
  SelectionStorage,
} from '../../storage/SelectionStorage'
import {
  withRememberedQuery,
  type SearchHistory,
  type SearchHistoryStorage,
} from '../../storage/SearchHistoryStorage'

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AssistantState {
  catalogStatus: CatalogStatus
  searchStatus: SearchStatus
  configurations: ClassifiedBuildConfiguration[]
  selectedProjectId: string
  selectedPlatforms: MobilePlatform[]
  selectedEnvironment: MobileEnvironment | ''
  searchMode: BuildSearchMode
  searchQueries: Record<BuildSearchMode, string>
  appliedSearch: AssistantSearchParameters
  searchHistory: SearchHistory
  matches: BuildArtifactMatch[]
  selectedBuildIds: ReadonlySet<string>
  catalogErrorMessage?: string
  searchErrorMessage?: string
  hasSearched: boolean
}

type AssistantAction =
  | { type: 'catalog-loading' }
  | {
      type: 'catalog-ready'
      configurations: ClassifiedBuildConfiguration[]
      draft: AssistantSearchParameters
      appliedSearch: AssistantSearchParameters
      searchHistory: SearchHistory
    }
  | { type: 'catalog-error'; message: string }
  | { type: 'select-project'; projectId: string }
  | { type: 'toggle-platform'; platform: MobilePlatform }
  | { type: 'select-environment'; environment: MobileEnvironment | '' }
  | { type: 'select-search-mode'; mode: BuildSearchMode }
  | { type: 'set-search-query'; mode: BuildSearchMode; query: string }
  | { type: 'discard-draft' }
  | { type: 'search-loading'; appliedSearch: AssistantSearchParameters }
  | { type: 'search-ready'; matches: BuildArtifactMatch[] }
  | { type: 'search-error'; message: string }
  | { type: 'remember-query'; history: SearchHistory }
  | { type: 'clear-history'; mode: BuildSearchMode }
  | { type: 'toggle-build'; buildId: string }

interface AssistantSelection {
  projectId: string
  platforms: MobilePlatform[]
  environment: MobileEnvironment | ''
}

interface AssistantSearchParameters extends AssistantSelection {
  searchMode: BuildSearchMode
  queries: Record<BuildSearchMode, string>
}

interface AssistantControllerOptions {
  service: TeamCityService
  classifier: BuildConfigurationClassifier
  storage: SelectionStorage
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
  canSearch: boolean
  loadCatalog(): Promise<void>
  selectProject(projectId: string): void
  togglePlatform(platform: MobilePlatform): void
  selectEnvironment(environment: MobileEnvironment | ''): void
  selectSearchMode(mode: BuildSearchMode): void
  setSearchQuery(mode: BuildSearchMode, query: string): void
  clearSearchHistory(mode: BuildSearchMode): void
  discardDraftChanges(): void
  search(): Promise<boolean>
  toggleBuild(buildId: string): void
}

function emptySearchParameters(): AssistantSearchParameters {
  return {
    projectId: '',
    platforms: [],
    environment: '',
    searchMode: 'task',
    queries: { task: '', build: '' },
  }
}

const initialState: AssistantState = {
  catalogStatus: 'idle',
  searchStatus: 'idle',
  configurations: [],
  selectedProjectId: '',
  selectedPlatforms: [],
  selectedEnvironment: '',
  searchMode: 'task',
  searchQueries: { task: '', build: '' },
  appliedSearch: emptySearchParameters(),
  searchHistory: { task: [], build: [] },
  matches: [],
  selectedBuildIds: new Set(),
  hasSearched: false,
}

function reducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case 'catalog-loading':
      return { ...state, catalogStatus: 'loading', catalogErrorMessage: undefined }
    case 'catalog-ready':
      return {
        ...state,
        catalogStatus: 'ready',
        configurations: action.configurations,
        selectedProjectId: action.draft.projectId,
        selectedPlatforms: action.draft.platforms,
        selectedEnvironment: action.draft.environment,
        searchMode: action.draft.searchMode,
        searchQueries: action.draft.queries,
        appliedSearch: action.appliedSearch,
        searchHistory: action.searchHistory,
        catalogErrorMessage: undefined,
      }
    case 'catalog-error':
      return {
        ...state,
        catalogStatus: 'error',
        catalogErrorMessage: action.message,
      }
    case 'select-project':
      return {
        ...state,
        selectedProjectId: action.projectId,
        selectedPlatforms: [],
        selectedEnvironment: '',
      }
    case 'toggle-platform': {
      const selectedPlatforms = state.selectedPlatforms.includes(action.platform)
        ? state.selectedPlatforms.filter((platform) => platform !== action.platform)
        : [...state.selectedPlatforms, action.platform]
      return {
        ...state,
        selectedPlatforms,
        selectedEnvironment: '',
      }
    }
    case 'select-environment':
      return {
        ...state,
        selectedEnvironment: action.environment,
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
    case 'discard-draft':
      return {
        ...state,
        selectedProjectId: state.appliedSearch.projectId,
        selectedPlatforms: state.appliedSearch.platforms,
        selectedEnvironment: state.appliedSearch.environment,
        searchMode: state.appliedSearch.searchMode,
        searchQueries: state.appliedSearch.queries,
      }
    case 'search-loading':
      return {
        ...state,
        searchStatus: 'loading',
        appliedSearch: action.appliedSearch,
        matches: [],
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
        hasSearched: true,
      }
    case 'search-ready':
      return {
        ...state,
        searchStatus: 'ready',
        matches: action.matches,
        selectedBuildIds: new Set(),
        searchErrorMessage: undefined,
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
  }
}

function getSafeErrorMessage(error: unknown): string {
  if (!(error instanceof TeamCityError)) {
    return 'Не удалось прочитать данные TeamCity. Повторите попытку.'
  }

  switch (error.code) {
    case 'NotAuthenticated':
      return 'Авторизуйтесь в TeamCity в этой вкладке и повторите запрос.'
    case 'Forbidden':
      return 'У вашей TeamCity-учётной записи нет доступа к этим данным.'
    case 'ResponseTooLarge':
      return 'Ответ TeamCity слишком большой. Уточните параметры поиска.'
    case 'TraversalLimitExceeded':
      return 'Поиск остановлен безопасным ограничением. Уточните параметры.'
    case 'RequestTimeout':
      return 'TeamCity отвечает слишком долго. Повторите поиск.'
    case 'InvalidRequest':
      return 'TeamCity вернул неподдерживаемую ссылку.'
    case 'TeamCityUnavailable':
      return 'TeamCity сейчас недоступен. Повторите попытку.'
    case 'UnexpectedResponse':
      return 'TeamCity вернул ответ неизвестного формата.'
  }
}

function projectsFrom(configurations: readonly ClassifiedBuildConfiguration[]): ProjectOption[] {
  const projects = new Map<string, ProjectOption>()
  for (const configuration of configurations) {
    if (configuration.os !== 'Unclassified') {
      const [rootName] = configuration.projectName.split('/')
      projects.set(configuration.projectId, {
        id: configuration.projectId,
        name: rootName?.trim() || configuration.projectName.trim(),
      })
    }
  }
  return [...projects.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function rememberedPlatforms(remembered: RememberedSelection | undefined): MobilePlatform[] {
  if (remembered?.os === 'Android') {
    return ['android']
  }
  if (remembered?.os === 'iOS') {
    return ['ios']
  }
  return []
}

function environmentOptions(
  configurations: readonly ClassifiedBuildConfiguration[],
  projectId: string,
  platforms: readonly MobilePlatform[],
): MobileEnvironment[] {
  const selectedOs = new Set(
    platforms.map((platform) => platform === 'android' ? 'Android' : 'iOS'),
  )
  return mobileEnvironments.filter((environment) =>
    environment !== 'Unclassified' && configurations.some((configuration) =>
      configuration.projectId === projectId &&
      configuration.environment === environment &&
      configuration.os !== 'Unclassified' &&
      (selectedOs.size === 0 || selectedOs.has(configuration.os)),
    ),
  )
}

function resolvedSelection(
  configurations: readonly ClassifiedBuildConfiguration[],
  current: AssistantSelection,
  remembered: RememberedSelection | undefined,
): AssistantSelection {
  const projects = projectsFrom(configurations)
  const projectId = projects.some((project) => project.id === current.projectId)
    ? current.projectId
    : projects.some((project) => project.id === remembered?.projectId)
      ? remembered?.projectId ?? ''
      : ''
  const platforms = current.projectId === projectId
    ? current.platforms
    : rememberedPlatforms(remembered)
  const environments = environmentOptions(configurations, projectId, platforms)
  const rememberedEnvironment = remembered?.environment === 'Unclassified'
    ? ''
    : remembered?.environment
  const preferredEnvironment = current.projectId === projectId
    ? current.environment
    : rememberedEnvironment ?? ''

  return {
    projectId,
    platforms,
    environment: preferredEnvironment === '' || environments.includes(preferredEnvironment)
      ? preferredEnvironment
      : '',
  }
}

function parametersFromState(state: AssistantState): AssistantSearchParameters {
  return {
    projectId: state.selectedProjectId,
    platforms: state.selectedPlatforms,
    environment: state.selectedEnvironment,
    searchMode: state.searchMode,
    queries: state.searchQueries,
  }
}

function rememberedParameters(remembered: RememberedSelection | undefined): AssistantSearchParameters {
  return {
    projectId: remembered?.projectId ?? '',
    platforms: rememberedPlatforms(remembered),
    environment: remembered?.environment === 'Unclassified'
      ? ''
      : remembered?.environment ?? '',
    searchMode: remembered?.searchMode ?? 'task',
    queries: {
      task: normalizeBuildSearchQuery(remembered?.taskQuery ?? ''),
      build: normalizeBuildSearchQuery(remembered?.buildQuery ?? ''),
    },
  }
}

function resolvedParameters(
  configurations: readonly ClassifiedBuildConfiguration[],
  preferred: AssistantSearchParameters,
  fallback?: RememberedSelection,
): AssistantSearchParameters {
  const filters = resolvedSelection(configurations, preferred, fallback)
  return {
    ...filters,
    searchMode: preferred.searchMode,
    queries: preferred.queries,
  }
}

function storedSelection(parameters: AssistantSearchParameters): RememberedSelection {
  const os = parameters.platforms.length === 1
    ? parameters.platforms[0] === 'android' ? 'Android' : 'iOS'
    : 'Unclassified'
  return {
    projectId: parameters.projectId,
    os,
    environment: parameters.environment || 'Unclassified',
    searchMode: parameters.searchMode,
    taskQuery: parameters.queries.task,
    buildQuery: parameters.queries.build,
  }
}

export function useAssistantController({
  service,
  classifier,
  storage,
  historyStorage,
  origin,
}: AssistantControllerOptions): AssistantController {
  const [state, dispatch] = useReducer(reducer, initialState)
  const catalogRequestRef = useRef(0)
  const searchRequestRef = useRef(0)
  const searchAbortRef = useRef<AbortController | undefined>(undefined)

  const projects = useMemo(
    () => projectsFrom(state.configurations),
    [state.configurations],
  )
  const environments = useMemo(
    () => environmentOptions(
      state.configurations,
      state.selectedProjectId,
      state.selectedPlatforms,
    ),
    [state.configurations, state.selectedPlatforms, state.selectedProjectId],
  )
  const searchableConfigurations = useMemo(() => {
    const selectedOs = new Set(
      state.selectedPlatforms.map((platform) => platform === 'android' ? 'Android' : 'iOS'),
    )
    return state.configurations.filter((configuration) =>
      configuration.projectId === state.selectedProjectId &&
      configuration.os !== 'Unclassified' &&
      !configuration.paused &&
      (selectedOs.size === 0 || selectedOs.has(configuration.os)) &&
      (state.selectedEnvironment === '' || configuration.environment === state.selectedEnvironment),
    )
  }, [
    state.configurations,
    state.selectedEnvironment,
    state.selectedPlatforms,
    state.selectedProjectId,
  ])

  useEffect(() => () => searchAbortRef.current?.abort(), [])

  async function loadCatalog() {
    const requestId = ++catalogRequestRef.current
    searchRequestRef.current += 1
    searchAbortRef.current?.abort()
    const current = state
    dispatch({ type: 'catalog-loading' })
    try {
      const [result, remembered, history] = await Promise.all([
        service.loadCatalog(),
        storage.load(origin).catch(() => undefined),
        historyStorage.load(origin).catch(() => ({ task: [], build: [] })),
      ])
      if (requestId !== catalogRequestRef.current) {
        return
      }
      const configurations = classifyBuildConfigurations(result.configurations, classifier)
      const fallback = rememberedParameters(remembered)
      const firstLoad = current.configurations.length === 0
      const appliedPreferred = firstLoad ? fallback : current.appliedSearch
      const draftPreferred = firstLoad ? fallback : parametersFromState(current)
      dispatch({
        type: 'catalog-ready',
        configurations,
        draft: resolvedParameters(configurations, draftPreferred, remembered),
        appliedSearch: resolvedParameters(configurations, appliedPreferred, remembered),
        searchHistory: history,
      })
    } catch (error) {
      if (requestId === catalogRequestRef.current) {
        dispatch({ type: 'catalog-error', message: getSafeErrorMessage(error) })
      }
    }
  }

  async function search(): Promise<boolean> {
    if (searchableConfigurations.length === 0) {
      return false
    }
    const current = parametersFromState(state)
    const normalizedQuery = normalizeBuildSearchQuery(current.queries[current.searchMode])
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
    void storage.save(origin, storedSelection(appliedSearch)).catch(() => undefined)
    const configurations: BuildArtifactSearchConfiguration[] = searchableConfigurations.map(
      (configuration) => ({
        id: configuration.id,
        name: configuration.name,
        platform: configuration.os === 'Android' ? 'android' : 'ios',
      }),
    )
    try {
      const result = await searchBuildArtifacts(service, configurations, {
        maximumBuilds: 20,
        concurrency: 4,
        query: normalizedQuery.length === 0
          ? undefined
          : { mode: current.searchMode, value: normalizedQuery },
        signal: controller.signal,
      })
      if (requestId === searchRequestRef.current) {
        dispatch({ type: 'search-ready', matches: result.matches })
        const nextHistory = withRememberedQuery(
          state.searchHistory,
          current.searchMode,
          normalizedQuery,
        )
        dispatch({ type: 'remember-query', history: nextHistory })
        void historyStorage.save(origin, nextHistory).catch(() => undefined)
        return true
      }
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        dispatch({ type: 'search-error', message: getSafeErrorMessage(error) })
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = undefined
      }
    }
    return false
  }

  function clearSearchHistory(mode: BuildSearchMode) {
    const nextHistory = { ...state.searchHistory, [mode]: [] }
    dispatch({ type: 'clear-history', mode })
    void historyStorage.save(origin, nextHistory).catch(() => undefined)
  }

  return {
    state,
    projects,
    environments,
    canSearch: state.catalogStatus === 'ready' && searchableConfigurations.length > 0,
    loadCatalog,
    selectProject: (projectId) => dispatch({ type: 'select-project', projectId }),
    togglePlatform: (platform) => dispatch({ type: 'toggle-platform', platform }),
    selectEnvironment: (environment) => dispatch({ type: 'select-environment', environment }),
    selectSearchMode: (mode) => dispatch({ type: 'select-search-mode', mode }),
    setSearchQuery: (mode, query) => dispatch({ type: 'set-search-query', mode, query }),
    clearSearchHistory,
    discardDraftChanges: () => dispatch({ type: 'discard-draft' }),
    search,
    toggleBuild: (buildId) => dispatch({ type: 'toggle-build', buildId }),
  }
}
