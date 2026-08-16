import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { MobilePlatform } from '../../teamcity/ArtifactResolver'
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

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AssistantState {
  catalogStatus: CatalogStatus
  searchStatus: SearchStatus
  configurations: ClassifiedBuildConfiguration[]
  selectedProjectId: string
  selectedPlatforms: MobilePlatform[]
  selectedEnvironment: MobileEnvironment | ''
  matches: BuildArtifactMatch[]
  selectedBuildIds: ReadonlySet<string>
  errorMessage?: string
  hasSearched: boolean
  rememberSelection: boolean
}

type AssistantAction =
  | { type: 'catalog-loading' }
  | {
      type: 'catalog-ready'
      configurations: ClassifiedBuildConfiguration[]
      selection: AssistantSelection
      rememberSelection: boolean
    }
  | { type: 'catalog-error'; message: string }
  | { type: 'select-project'; projectId: string }
  | { type: 'toggle-platform'; platform: MobilePlatform }
  | { type: 'select-environment'; environment: MobileEnvironment | '' }
  | { type: 'search-loading' }
  | { type: 'search-ready'; matches: BuildArtifactMatch[] }
  | { type: 'search-error'; message: string }
  | { type: 'toggle-build'; buildId: string }

interface AssistantSelection {
  projectId: string
  platforms: MobilePlatform[]
  environment: MobileEnvironment | ''
}

interface AssistantControllerOptions {
  service: TeamCityService
  classifier: BuildConfigurationClassifier
  storage: SelectionStorage
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
  search(): Promise<void>
  toggleBuild(buildId: string): void
}

const initialState: AssistantState = {
  catalogStatus: 'idle',
  searchStatus: 'idle',
  configurations: [],
  selectedProjectId: '',
  selectedPlatforms: [],
  selectedEnvironment: '',
  matches: [],
  selectedBuildIds: new Set(),
  hasSearched: false,
  rememberSelection: false,
}

function resetSearchState(state: AssistantState): AssistantState {
  return {
    ...state,
    searchStatus: 'idle',
    matches: [],
    selectedBuildIds: new Set(),
    errorMessage: undefined,
    hasSearched: false,
  }
}

function reducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case 'catalog-loading':
      return { ...state, catalogStatus: 'loading', errorMessage: undefined }
    case 'catalog-ready':
      return {
        ...resetSearchState(state),
        catalogStatus: 'ready',
        configurations: action.configurations,
        selectedProjectId: action.selection.projectId,
        selectedPlatforms: action.selection.platforms,
        selectedEnvironment: action.selection.environment,
        rememberSelection: action.rememberSelection,
      }
    case 'catalog-error':
      return {
        ...state,
        catalogStatus: 'error',
        configurations: [],
        errorMessage: action.message,
      }
    case 'select-project':
      return {
        ...resetSearchState(state),
        selectedProjectId: action.projectId,
        selectedPlatforms: [],
        selectedEnvironment: '',
      }
    case 'toggle-platform': {
      const selectedPlatforms = state.selectedPlatforms.includes(action.platform)
        ? state.selectedPlatforms.filter((platform) => platform !== action.platform)
        : [...state.selectedPlatforms, action.platform]
      return {
        ...resetSearchState(state),
        selectedPlatforms,
        selectedEnvironment: '',
      }
    }
    case 'select-environment':
      return {
        ...resetSearchState(state),
        selectedEnvironment: action.environment,
      }
    case 'search-loading':
      return {
        ...state,
        searchStatus: 'loading',
        matches: [],
        selectedBuildIds: new Set(),
        errorMessage: undefined,
      }
    case 'search-ready':
      return {
        ...state,
        searchStatus: 'ready',
        matches: action.matches,
        selectedBuildIds: new Set(),
        errorMessage: undefined,
        hasSearched: true,
      }
    case 'search-error':
      return {
        ...state,
        searchStatus: 'error',
        matches: [],
        selectedBuildIds: new Set(),
        errorMessage: action.message,
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

function storedSelection(selection: AssistantSelection): RememberedSelection {
  const os = selection.platforms.length === 1
    ? selection.platforms[0] === 'android' ? 'Android' : 'iOS'
    : 'Unclassified'
  return {
    projectId: selection.projectId,
    os,
    environment: selection.environment || 'Unclassified',
  }
}

export function useAssistantController({
  service,
  classifier,
  storage,
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

  useEffect(() => {
    if (
      state.catalogStatus !== 'ready' ||
      !state.rememberSelection ||
      state.selectedProjectId.length === 0
    ) {
      return
    }
    void storage.save(origin, storedSelection({
      projectId: state.selectedProjectId,
      platforms: state.selectedPlatforms,
      environment: state.selectedEnvironment,
    })).catch(() => undefined)
  }, [
    origin,
    state.catalogStatus,
    state.rememberSelection,
    state.selectedEnvironment,
    state.selectedPlatforms,
    state.selectedProjectId,
    storage,
  ])

  useEffect(() => () => searchAbortRef.current?.abort(), [])

  async function loadCatalog() {
    const requestId = ++catalogRequestRef.current
    searchRequestRef.current += 1
    searchAbortRef.current?.abort()
    const current = state
    dispatch({ type: 'catalog-loading' })
    try {
      const [result, remembered] = await Promise.all([
        service.loadCatalog(),
        storage.load(origin).catch(() => undefined),
      ])
      if (requestId !== catalogRequestRef.current) {
        return
      }
      const configurations = classifyBuildConfigurations(result.configurations, classifier)
      dispatch({
        type: 'catalog-ready',
        configurations,
        selection: resolvedSelection(
          configurations,
          {
            projectId: current.selectedProjectId,
            platforms: current.selectedPlatforms,
            environment: current.selectedEnvironment,
          },
          remembered,
        ),
        rememberSelection: current.rememberSelection || remembered !== undefined,
      })
    } catch (error) {
      if (requestId === catalogRequestRef.current) {
        dispatch({ type: 'catalog-error', message: getSafeErrorMessage(error) })
      }
    }
  }

  async function search() {
    if (searchableConfigurations.length === 0) {
      return
    }
    const requestId = ++searchRequestRef.current
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    dispatch({ type: 'search-loading' })
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
        signal: controller.signal,
      })
      if (requestId === searchRequestRef.current) {
        dispatch({ type: 'search-ready', matches: result.matches })
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
    search,
    toggleBuild: (buildId) => dispatch({ type: 'toggle-build', buildId }),
  }
}
