import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ArtifactResolution, MobilePlatform } from '../teamcity/ArtifactResolver'
import type { TeamCityBuild } from '../teamcity/BuildFinder'
import {
  BuildConfigurationClassifier,
  classifyBuildConfigurations,
  mobileEnvironments,
  mobileOperatingSystems,
  type ClassifiedBuildConfiguration,
  type MobileEnvironment,
  type MobileOperatingSystem,
} from '../teamcity/BuildConfigurationClassifier'
import {
  createTeamCityService,
  type TeamCityService,
} from '../teamcity/TeamCityService'
import { TeamCityError } from '../teamcity/TeamCityError'
import {
  ChromeSelectionStorage,
  type RememberedSelection,
  type SelectionStorage,
} from '../storage/SelectionStorage'
import type { LauncherStorage } from '../storage/LauncherStorage'
import { TeamCityNavTab } from './TeamCityNavTab'

type LoadingOperation = 'catalog' | 'builds' | 'artifacts' | undefined

const panelId = 'teamcity-mobile-build-assistant-panel'

interface AppProps {
  service?: TeamCityService
  classifier?: BuildConfigurationClassifier
  selectionStorage?: SelectionStorage
  launcherStorage?: LauncherStorage
  origin?: string
  auxiliaryPanel?: ReactNode
}

interface ProjectOption {
  id: string
  name: string
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
      return 'Список artifacts слишком большой. Попробуйте другую сборку.'
    case 'TraversalLimitExceeded':
      return 'Не удалось безопасно завершить поиск mobile artifact.'
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

function formatBuildLabel(
  build: TeamCityBuild,
  configurations: readonly ClassifiedBuildConfiguration[],
): string {
  const branch = build.branchName ?? (build.defaultBranch ? 'default branch' : 'branch не указан')
  const configuration = configurations.find((item) => item.id === build.buildTypeId)
  const configurationLabel = configurations.length > 1 && configuration !== undefined
    ? `${configuration.name} · `
    : ''
  return `${configurationLabel}#${build.number} · ${branch}${build.finishDate ? ` · ${build.finishDate}` : ''}`
}

function uniqueProjects(configurations: readonly ClassifiedBuildConfiguration[]): ProjectOption[] {
  const projects = new Map<string, ProjectOption>()
  for (const configuration of configurations) {
    projects.set(configuration.projectId, {
      id: configuration.projectId,
      name: configuration.projectName,
    })
  }
  return [...projects.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function osOptions(configurations: readonly ClassifiedBuildConfiguration[]): MobileOperatingSystem[] {
  return mobileOperatingSystems.filter((os) => configurations.some((item) => item.os === os))
}

function environmentOptions(
  configurations: readonly ClassifiedBuildConfiguration[],
  os: MobileOperatingSystem,
): MobileEnvironment[] {
  return mobileEnvironments.filter((environment) =>
    configurations.some((item) => item.os === os && item.environment === environment),
  )
}

function initialSelection(
  configurations: readonly ClassifiedBuildConfiguration[],
  remembered: RememberedSelection | undefined,
): RememberedSelection | undefined {
  const projects = uniqueProjects(configurations)
  const projectId = projects.some((project) => project.id === remembered?.projectId)
    ? remembered?.projectId
    : projects[0]?.id
  if (projectId === undefined) {
    return undefined
  }

  const projectConfigurations = configurations.filter((item) => item.projectId === projectId)
  const availableOs = osOptions(projectConfigurations)
  const os = remembered !== undefined && availableOs.includes(remembered.os)
    ? remembered.os
    : availableOs[0]
  if (os === undefined) {
    return undefined
  }

  const availableEnvironments = environmentOptions(projectConfigurations, os)
  const environment = remembered !== undefined && availableEnvironments.includes(remembered.environment)
    ? remembered.environment
    : availableEnvironments[0]
  return environment === undefined ? undefined : { projectId, os, environment }
}

function platformFromOs(os: MobileOperatingSystem): MobilePlatform | undefined {
  if (os === 'Android') {
    return 'android'
  }
  if (os === 'iOS') {
    return 'ios'
  }
  return undefined
}

export function App({
  service,
  classifier,
  selectionStorage,
  launcherStorage,
  origin,
  auxiliaryPanel,
}: AppProps) {
  const teamCity = useMemo(() => service ?? createTeamCityService(), [service])
  const catalogClassifier = useMemo(
    () => classifier ?? new BuildConfigurationClassifier(),
    [classifier],
  )
  const storage = useMemo(
    () => selectionStorage ?? new ChromeSelectionStorage(),
    [selectionStorage],
  )
  const runtimeOrigin = origin ?? window.location.origin
  const [isOpen, setIsOpen] = useState(false)
  const [operation, setOperation] = useState<LoadingOperation>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [configurations, setConfigurations] = useState<ClassifiedBuildConfiguration[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedOs, setSelectedOs] = useState<MobileOperatingSystem>('Unclassified')
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<MobileEnvironment>('Unclassified')
  const [unclassifiedPlatform, setUnclassifiedPlatform] = useState<MobilePlatform>('android')
  const [rememberSelection, setRememberSelection] = useState(false)
  const [builds, setBuilds] = useState<TeamCityBuild[]>([])
  const [selectedBuildId, setSelectedBuildId] = useState('')
  const [artifactResolution, setArtifactResolution] = useState<ArtifactResolution>()
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [actionMessage, setActionMessage] = useState<string>()
  const [failedOperation, setFailedOperation] = useState<Exclude<LoadingOperation, undefined>>()

  const projects = useMemo(() => uniqueProjects(configurations), [configurations])
  const projectConfigurations = configurations.filter(
    (configuration) => configuration.projectId === selectedProjectId,
  )
  const availableOs = osOptions(projectConfigurations)
  const availableEnvironments = environmentOptions(projectConfigurations, selectedOs)
  const selectedConfigurations = projectConfigurations.filter(
    (configuration) =>
      configuration.os === selectedOs && configuration.environment === selectedEnvironment,
  )
  const activeConfigurations = selectedConfigurations.filter((configuration) => !configuration.paused)
  const selectedBuild = builds.find((build) => build.id === selectedBuildId)
  const selectedPlatform = platformFromOs(selectedOs) ?? unclassifiedPlatform

  useEffect(() => {
    if (!catalogLoaded || selectedProjectId.length === 0) {
      return
    }

    if (rememberSelection) {
      void storage.save(runtimeOrigin, {
        projectId: selectedProjectId,
        os: selectedOs,
        environment: selectedEnvironment,
      })
    } else {
      void storage.clear(runtimeOrigin)
    }
  }, [
    catalogLoaded,
    rememberSelection,
    runtimeOrigin,
    selectedEnvironment,
    selectedOs,
    selectedProjectId,
    storage,
  ])

  function resetBuildSelection() {
    setBuilds([])
    setSelectedBuildId('')
    setArtifactResolution(undefined)
    setActionMessage(undefined)
    setErrorMessage(undefined)
    setFailedOperation(undefined)
  }

  async function loadCatalog() {
    setOperation('catalog')
    setFailedOperation(undefined)
    setErrorMessage(undefined)
    setArtifactResolution(undefined)

    try {
      const [result, remembered] = await Promise.all([
        teamCity.loadCatalog(),
        storage.load(runtimeOrigin).catch(() => undefined),
      ])
      const classified = classifyBuildConfigurations(result.configurations, catalogClassifier)
      const selection = initialSelection(classified, remembered)
      setConfigurations(classified)
      setCatalogLoaded(true)
      setRememberSelection(remembered !== undefined)
      setSelectedProjectId(selection?.projectId ?? '')
      setSelectedOs(selection?.os ?? 'Unclassified')
      setSelectedEnvironment(selection?.environment ?? 'Unclassified')
      resetBuildSelection()
    } catch (error) {
      setCatalogLoaded(false)
      setConfigurations([])
      setErrorMessage(getSafeErrorMessage(error))
      setFailedOperation('catalog')
    } finally {
      setOperation(undefined)
    }
  }

  function togglePanel() {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    setIsOpen(true)
    if (operation === undefined) {
      void loadCatalog()
    }
  }

  async function loadBuilds() {
    if (activeConfigurations.length === 0) {
      return
    }

    setOperation('builds')
    setFailedOperation(undefined)
    setErrorMessage(undefined)
    setArtifactResolution(undefined)
    setActionMessage(undefined)

    try {
      const result = await teamCity.loadBuilds(activeConfigurations.map(({ id }) => id))
      setBuilds(result.builds)
      setSelectedBuildId(result.builds[0]?.id ?? '')
    } catch (error) {
      setBuilds([])
      setSelectedBuildId('')
      setErrorMessage(getSafeErrorMessage(error))
      setFailedOperation('builds')
    } finally {
      setOperation(undefined)
    }
  }

  async function inspectArtifacts() {
    if (selectedBuild === undefined) {
      return
    }

    setOperation('artifacts')
    setFailedOperation(undefined)
    setErrorMessage(undefined)
    setArtifactResolution(undefined)
    setActionMessage(undefined)

    try {
      const resolution = await teamCity.resolveArtifact(
        selectedBuild.id,
        selectedBuild.buildTypeId,
        selectedPlatform,
      )
      setArtifactResolution(resolution)
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error))
      setFailedOperation('artifacts')
    } finally {
      setOperation(undefined)
    }
  }

  function selectProject(projectId: string) {
    const nextConfigurations = configurations.filter((item) => item.projectId === projectId)
    const os = osOptions(nextConfigurations)[0] ?? 'Unclassified'
    const environment = environmentOptions(nextConfigurations, os)[0] ?? 'Unclassified'
    setSelectedProjectId(projectId)
    setSelectedOs(os)
    setSelectedEnvironment(environment)
    resetBuildSelection()
  }

  function selectOs(os: MobileOperatingSystem) {
    setSelectedOs(os)
    setSelectedEnvironment(environmentOptions(projectConfigurations, os)[0] ?? 'Unclassified')
    resetBuildSelection()
  }

  function selectEnvironment(environment: MobileEnvironment) {
    setSelectedEnvironment(environment)
    resetBuildSelection()
  }

  async function copyArtifactLink() {
    const href = artifactResolution?.status === 'Resolved'
      ? artifactResolution.candidates[0]?.contentHref
      : undefined
    if (href === undefined) {
      return
    }
    try {
      await navigator.clipboard.writeText(new URL(href, runtimeOrigin).toString())
      setActionMessage('Ссылка скопирована.')
    } catch {
      setActionMessage('Не удалось скопировать ссылку.')
    }
  }

  function openArtifact() {
    const href = artifactResolution?.status === 'Resolved'
      ? artifactResolution.candidates[0]?.contentHref
      : undefined
    if (href !== undefined) {
      window.open(new URL(href, runtimeOrigin), '_blank', 'noopener,noreferrer')
    }
  }

  function retryFailedRequest() {
    if (failedOperation === 'artifacts') {
      void inspectArtifacts()
      return
    }
    if (failedOperation === 'builds') {
      void loadBuilds()
      return
    }
    void loadCatalog()
  }

  return (
    <TeamCityNavTab
      origin={runtimeOrigin}
      panelId={panelId}
      panelOpen={isOpen}
      storage={launcherStorage}
      auxiliaryPanel={auxiliaryPanel}
      onTogglePanel={togglePanel}
      onCollapse={() => setIsOpen(false)}
    >
      <section id={panelId} className="tcba-panel" aria-live="polite">
          <header className="tcba-panel__header">
            <div>
              <strong>Mobile Build Assistant</strong>
              <span>Выберите сборку и найдите mobile artifact</span>
            </div>
            <button
              className="tcba-icon-button"
              type="button"
              aria-label="Закрыть панель"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </header>

          {(operation === 'catalog' || errorMessage !== undefined) && (
            <div className="tcba-status">
              <span className={errorMessage ? 'tcba-dot tcba-dot--error' : 'tcba-dot'} />
              <span>{operation === 'catalog' ? 'Загружаем доступные проекты…' : errorMessage}</span>
            </div>
          )}

          {errorMessage && (
            <button
              className="tcba-button tcba-button--secondary"
              type="button"
              onClick={retryFailedRequest}
            >
              Повторить запрос
            </button>
          )}

          {catalogLoaded && (
            <div className="tcba-form">
              {configurations.length === 0 ? (
                <p className="tcba-empty">Доступных build configurations не найдено.</p>
              ) : (
                <>
                  <label>
                    <span>Project</span>
                    <select value={selectedProjectId} onChange={(event) => selectProject(event.target.value)}>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>OS</span>
                    <select
                      value={selectedOs}
                      onChange={(event) => selectOs(event.target.value as MobileOperatingSystem)}
                    >
                      {availableOs.map((os) => <option key={os} value={os}>{os}</option>)}
                    </select>
                  </label>

                  <label>
                    <span>Environment</span>
                    <select
                      value={selectedEnvironment}
                      onChange={(event) => selectEnvironment(event.target.value as MobileEnvironment)}
                    >
                      {availableEnvironments.map((environment) => (
                        <option key={environment} value={environment}>{environment}</option>
                      ))}
                    </select>
                  </label>

                  <label className="tcba-checkbox">
                    <input
                      type="checkbox"
                      checked={rememberSelection}
                      onChange={(event) => setRememberSelection(event.target.checked)}
                    />
                    <span>Запомнить выбранные значения для этого TeamCity</span>
                  </label>

                  {selectedConfigurations.length === 0 ? (
                    <p className="tcba-empty">Для выбранной комбинации нет build configurations.</p>
                  ) : (
                    <button
                      className="tcba-button"
                      type="button"
                      disabled={operation !== undefined || activeConfigurations.length === 0}
                      onClick={loadBuilds}
                    >
                      {operation === 'builds' ? 'Загружаем сборки…' : 'Показать успешные сборки'}
                    </button>
                  )}

                  {activeConfigurations.length === 0 && selectedConfigurations.length > 0 && (
                    <p className="tcba-hint">Все configurations в этой группе приостановлены.</p>
                  )}

                  {builds.length > 0 && (
                    <>
                      <label>
                        <span>Build</span>
                        <select
                          value={selectedBuildId}
                          onChange={(event) => {
                            setSelectedBuildId(event.target.value)
                            setArtifactResolution(undefined)
                            setActionMessage(undefined)
                          }}
                        >
                          {builds.map((build) => (
                            <option key={build.id} value={build.id}>
                              {formatBuildLabel(build, activeConfigurations)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedOs === 'Unclassified' && (
                        <label>
                          <span>Тип mobile artifact</span>
                          <select
                            value={unclassifiedPlatform}
                            onChange={(event) => {
                              setUnclassifiedPlatform(event.target.value as MobilePlatform)
                              setArtifactResolution(undefined)
                              setActionMessage(undefined)
                            }}
                          >
                            <option value="android">Android (.apk)</option>
                            <option value="ios">iOS (.ipa)</option>
                          </select>
                        </label>
                      )}

                      <button
                        className="tcba-button"
                        type="button"
                        disabled={
                          operation !== undefined ||
                          selectedBuild === undefined
                        }
                        onClick={inspectArtifacts}
                      >
                        {operation === 'artifacts' ? 'Ищем artifact…' : 'Найти mobile artifact'}
                      </button>
                    </>
                  )}

                  {builds.length === 0 && operation !== 'builds' && selectedConfigurations.length > 0 && (
                    <p className="tcba-hint">Загрузите успешные завершённые сборки из всех branches.</p>
                  )}

                  {selectedOs === 'Unclassified' && (
                    <p className="tcba-hint">
                      OS не распознана. После загрузки сборки явно выберите APK или IPA.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {artifactResolution && (
            <section className={`tcba-result tcba-result--${artifactResolution.status.toLowerCase()}`}>
              <strong>
                {artifactResolution.status === 'Resolved' && 'Mobile artifact найден'}
                {artifactResolution.status === 'NotFound' && 'Mobile artifact не найден'}
                {artifactResolution.status === 'Ambiguous' && 'Найдено несколько mobile artifacts'}
              </strong>
              {artifactResolution.status === 'NotFound' && (
                <span>В выбранной сборке нет подходящего APK/IPA.</span>
              )}
              {artifactResolution.status === 'Ambiguous' && (
                <span>Автоматический выбор отключён. Проверьте публикацию artifacts в TeamCity.</span>
              )}
              {artifactResolution.candidates.map((candidate) => (
                <code key={candidate.contentHref}>{candidate.fullName}</code>
              ))}
              {artifactResolution.status === 'Resolved' && (
                <div className="tcba-actions">
                  <button className="tcba-button tcba-button--secondary" type="button" onClick={copyArtifactLink}>
                    Скопировать ссылку
                  </button>
                  <button className="tcba-button" type="button" onClick={openArtifact}>
                    Открыть artifact
                  </button>
                </div>
              )}
            </section>
          )}

          {actionMessage && <p className="tcba-action-message">{actionMessage}</p>}
          <p className="tcba-privacy">Используется текущая авторизованная сессия TeamCity.</p>
      </section>
    </TeamCityNavTab>
  )
}
