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
import { TeamCityError } from '../../teamcity/TeamCityError'
import {
  withRememberedQuery,
  type SearchHistory,
  type SearchHistoryStorage,
} from '../../storage/SearchHistoryStorage'
export type AssistantPlatformFilter = BuildArtifactSearchConfiguration['platform']
const assistantPlatformFilters = ['android', 'ios', 'other'] as const


type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AssistantState {
  catalogStatus: CatalogStatus
  searchStatus: SearchStatus
  configurations: ClassifiedBuildConfiguration[]
  selectedProjectId: string
  selectedPlatforms: AssistantPlatformFilter[]
  selectedEnvironment: MobileEnvironment | ''
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
      searchHistory: SearchHistory
      warningMessage?: string
    }
  | { type: 'catalog-error'; message: string }
  | { type: 'select-project'; projectId: string }
  | { type: 'toggle-platform'; platform: AssistantPlatformFilter }
  | { type: 'select-environment'; environment: MobileEnvironment | '' }
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
  environment: MobileEnvironment | ''
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
  hasOtherConfigurations: boolean
  canSearch: boolean
  loadCatalog(): Promise<void>
  selectProject(projectId: string): void
  togglePlatform(platform: AssistantPlatformFilter): void
  selectEnvironment(environment: MobileEnvironment | ''): void
  selectSearchMode(mode: BuildSearchMode): void
  setSearchQuery(mode: BuildSearchMode, query: string): void
  clearSearchHistory(mode: BuildSearchMode): void
  resetSession(): void
  search(): Promise<boolean>
  stopSearch(): void
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

function createInitialState(
  searchHistory: SearchHistory = { task: [], build: [] },
): AssistantState {
  return {
    catalogStatus: 'idle',
    searchStatus: 'idle',
    configurations: [],
    selectedProjectId: '',
    selectedPlatforms: [],
    selectedEnvironment: '',
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
        selectedProjectId: action.draft.projectId,
        selectedPlatforms: action.draft.platforms,
        selectedEnvironment: action.draft.environment,
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
  platforms: readonly AssistantPlatformFilter[],
): MobileEnvironment[] {
  const selectedPlatforms = new Set(platforms)
  return mobileEnvironments.filter((environment) =>
    environment !== 'Unclassified' && configurations.some((configuration) =>
      configuration.projectId === projectId &&
      configuration.environment === environment &&
      (selectedPlatforms.size === 0 ||
        selectedPlatforms.has(platformFilterFor(configuration))),
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
  const environments = environmentOptions(configurations, projectId, platforms)
  const preferredEnvironment = current.projectId === projectId
    ? current.environment
    : ''

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
  const hasOtherConfigurations = state.configurations.some((configuration) =>
    configuration.projectId === state.selectedProjectId &&
    configuration.os === 'Unclassified' &&
    !configuration.paused,
  )
  const searchableConfigurations = useMemo(() => {
    const selectedPlatforms = new Set(state.selectedPlatforms)
    return state.configurations.filter((configuration) =>
      configuration.projectId === state.selectedProjectId &&
      !configuration.paused &&
      (selectedPlatforms.size === 0 ||
        selectedPlatforms.has(platformFilterFor(configuration))) &&
      (state.selectedEnvironment === '' || configuration.environment === state.selectedEnvironment),
    )
  }, [
    state.configurations,
    state.selectedEnvironment,
    state.selectedPlatforms,
    state.selectedProjectId,
  ])

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
      restoreStoredHistoryRef.current = false
      dispatch({
        type: 'catalog-ready',
        configurations,
        draft: resolvedParameters(configurations, parametersFromState(current)),
        appliedSearch: resolvedParameters(configurations, current.appliedSearch),
        searchHistory: history,
        warningMessage: getCatalogWarningMessage(result.skippedConfigurations),
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
    dispatch({ type: 'reset-session' })
  }, [])

  function clearSearchHistory(mode: BuildSearchMode) {
    const nextHistory = { ...state.searchHistory, [mode]: [] }
    dispatch({ type: 'clear-history', mode })
    void historyStorage.save(origin, nextHistory).catch(() => undefined)
  }

  return {
    state,
    projects,
    environments,
    hasOtherConfigurations,
    canSearch: state.catalogStatus === 'ready' && searchableConfigurations.length > 0,
    loadCatalog,
    selectProject: (projectId) => dispatch({ type: 'select-project', projectId }),
    togglePlatform: (platform) => dispatch({ type: 'toggle-platform', platform }),
    selectEnvironment: (environment) => dispatch({ type: 'select-environment', environment }),
    selectSearchMode: (mode) => dispatch({ type: 'select-search-mode', mode }),
    setSearchQuery: (mode, query) => dispatch({ type: 'set-search-query', mode, query }),
    clearSearchHistory,
    resetSession,
    search,
    stopSearch,
    toggleBuild: (buildId) => dispatch({ type: 'toggle-build', buildId }),
  }
}
