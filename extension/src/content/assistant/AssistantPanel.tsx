import { useEffect, useState } from 'react'
import type { BuildArtifactMatch } from '../../teamcity/BuildArtifactSearch'
import type { MobileEnvironment } from '../../teamcity/BuildConfigurationClassifier'
import {
  isOpenTeamCityBuildResponse,
  type OpenTeamCityBuildRequest,
} from '../../teamcity/contracts'
import { toTrustedTeamCityUrl } from '../../teamcity/restPath'
import type { AssistantController } from './useAssistantController'
import { BuildResults } from './BuildResults'
import { Combobox } from './Combobox'
import { LoadingIcon } from './Icons'
import { PanelToolbar } from './PanelToolbar'
import { PlatformFilter } from './PlatformFilter'

interface AssistantPanelProps {
  id: string
  origin: string
  controller: AssistantController
  onClose(): void
}

export function AssistantPanel({ id, origin, controller, onClose }: AssistantPanelProps) {
  const { state } = controller
  const [toast, setToast] = useState<string>()
  const searching = state.searchStatus === 'loading'
  const catalogLoading = state.catalogStatus === 'loading'
  const showResults = state.hasSearched && !searching

  useEffect(() => {
    if (toast === undefined) {
      return
    }
    const timeout = window.setTimeout(() => setToast(undefined), 2200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  async function copyLinks(matches: readonly BuildArtifactMatch[]) {
    if (matches.length === 0) {
      return
    }
    try {
      const links = matches.map((match) =>
        toTrustedTeamCityUrl(match.artifact.contentHref, origin),
      )
      await navigator.clipboard.writeText(links.join('\n'))
      setToast(links.length === 1 ? 'Ссылка скопирована' : `Скопировано ссылок: ${links.length}`)
    } catch {
      setToast('Не удалось скопировать')
    }
  }

  function download(match: BuildArtifactMatch) {
    try {
      const url = toTrustedTeamCityUrl(match.artifact.contentHref, origin)
      window.open(url, '_blank', 'noopener,noreferrer')
      setToast('Началась скачка')
    } catch {
      setToast('Не удалось открыть ссылку')
    }
  }

  async function openBuild(match: BuildArtifactMatch) {
    try {
      const request: OpenTeamCityBuildRequest = {
        type: 'teamcity:open-build',
        buildId: match.build.id,
      }
      const response: unknown = await chrome.runtime.sendMessage(request)
      if (!isOpenTeamCityBuildResponse(response) || !response.ok) {
        throw new Error('The build tab could not be opened.')
      }
    } catch {
      setToast('Не удалось открыть билд')
    }
  }

  const searchButtonLabel = state.selectedProjectId.length === 0
    ? 'Выберите проект'
    : searching
      ? 'Поиск сборок…'
      : 'Поиск сборок'

  return (
    <section id={id} className="tcba-assistant" aria-labelledby={`${id}-title`}>
      <h1 className="tcba-sr-only" id={`${id}-title`}>TeamCity Mobile Build Assistant</h1>
      <PanelToolbar
        refreshEnabled={state.hasSearched}
        loading={catalogLoading}
        onRefresh={() => void controller.loadCatalog()}
        onClose={onClose}
      />

      {toast !== undefined && <div className="tcba-toast" role="status">{toast}</div>}

      <div className="tcba-assistant__filters">
        <Combobox
          label="Проект"
          value={state.selectedProjectId}
          placeholder={catalogLoading ? 'Загрузка проектов…' : 'Выберите проект'}
          options={controller.projects.map((project) => ({ value: project.id, label: project.name }))}
          disabled={catalogLoading || searching || controller.projects.length === 0}
          onChange={controller.selectProject}
        />
        <PlatformFilter
          selected={state.selectedPlatforms}
          disabled={state.selectedProjectId.length === 0 || catalogLoading || searching}
          onToggle={controller.togglePlatform}
        />
        <Combobox<MobileEnvironment>
          label="Окружение"
          value={state.selectedEnvironment}
          placeholder="Выберите окружение"
          options={controller.environments.map((environment) => ({ value: environment, label: environment }))}
          disabled={state.selectedProjectId.length === 0 || catalogLoading || searching || controller.environments.length === 0}
          onChange={controller.selectEnvironment}
        />
      </div>

      {state.errorMessage !== undefined && (
        <div className="tcba-assistant__error" role="alert">
          <span>{state.errorMessage}</span>
          <button
            type="button"
            onClick={() => void (state.catalogStatus === 'error' ? controller.loadCatalog() : controller.search())}
          >
            Повторить
          </button>
        </div>
      )}

      {showResults ? (
        <BuildResults
          matches={state.matches}
          selectedBuildIds={state.selectedBuildIds}
          onRefresh={() => void controller.search()}
          onToggle={controller.toggleBuild}
          onCopy={(matches) => void copyLinks(matches)}
          onDownload={download}
          onOpenBuild={openBuild}
        />
      ) : (
        <div className="tcba-assistant__search">
          <button
            className={`tcba-search-button${searching ? ' tcba-search-button--loading' : ''}`}
            type="button"
            aria-busy={searching}
            disabled={!controller.canSearch || searching || catalogLoading}
            onClick={() => void controller.search()}
          >
            {searching && <LoadingIcon className="tcba-search-button__loader" />}
            {searchButtonLabel}
          </button>
        </div>
      )}
    </section>
  )
}
