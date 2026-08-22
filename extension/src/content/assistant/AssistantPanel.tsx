import type { MobileEnvironment } from '../../teamcity/BuildConfigurationClassifier'
import type { AssistantController } from './useAssistantController'
import { Combobox } from './Combobox'
import { LoadingIcon, StopIcon } from './Icons'
import { PanelToolbar } from './PanelToolbar'
import { PlatformFilter } from './PlatformFilter'
import { SearchField } from './SearchField'

interface AssistantPanelProps {
  id: string
  controller: AssistantController
  onSearch(): void
  onClose(): void
}

export function AssistantPanel({ id, controller, onSearch, onClose }: AssistantPanelProps) {
  const { state } = controller
  const searching = state.searchStatus === 'loading'
  const catalogLoading = state.catalogStatus === 'loading'
  const searchButtonLabel = state.selectedProjectId.length === 0
    ? 'Выберите проект'
    : searching
      ? 'Поиск сборок…'
      : 'Поиск сборок'

  return (
    <section id={id} className="tcba-assistant" aria-labelledby={`${id}-title`}>
      <h1 className="tcba-sr-only" id={`${id}-title`}>TeamCity Mobile Build Assistant</h1>
      <PanelToolbar
        refreshEnabled={state.catalogStatus === 'ready' && !searching}
        loading={catalogLoading}
        onRefresh={() => void controller.loadCatalog()}
        onClose={onClose}
      />

      <div className="tcba-assistant__filters">
        <Combobox
          label="Проект"
          value={state.selectedProjectId}
          placeholder="Выберите проект"
          options={controller.projects.map((project) => ({ value: project.id, label: project.name }))}
          disabled={catalogLoading || searching || controller.projects.length === 0}
          onChange={controller.selectProject}
        />
        <SearchField
          mode={state.searchMode}
          queries={state.searchQueries}
          history={state.searchHistory}
          disabled={catalogLoading || searching}
          onModeChange={controller.selectSearchMode}
          onQueryChange={controller.setSearchQuery}
          onClearHistory={controller.clearSearchHistory}
          onSearch={onSearch}
        />
        <Combobox<MobileEnvironment>
          label="Окружение"
          value={state.selectedEnvironment}
          placeholder="Выберите окружение"
          options={controller.environments.map((environment) => ({ value: environment, label: environment }))}
          disabled={state.selectedProjectId.length === 0 || catalogLoading || searching || controller.environments.length === 0}
          onChange={controller.selectEnvironment}
        />
        <PlatformFilter
          selected={state.selectedPlatforms}
          disabled={state.selectedProjectId.length === 0 || catalogLoading || searching}
          onToggle={controller.togglePlatform}
        />
      </div>

      {state.catalogStatus === 'error' && state.catalogErrorMessage !== undefined && (
        <div className="tcba-assistant__error" role="alert">
          <span>{state.catalogErrorMessage}</span>
          <button type="button" onClick={() => void controller.loadCatalog()}>
            Повторить
          </button>
        </div>
      )}

      <div className="tcba-assistant__search">
        <button
          className={`tcba-search-button${searching ? ' tcba-search-button--loading' : ''}`}
          type="button"
          aria-busy={searching}
          disabled={!controller.canSearch || searching || catalogLoading}
          onClick={onSearch}
        >
          {searching && <LoadingIcon className="tcba-search-button__loader" />}
          {searchButtonLabel}
        </button>
        {searching && (
          <button
            className="tcba-stop-button"
            type="button"
            aria-label="Остановить поиск сборок"
            title="Остановить поиск"
            onClick={controller.stopSearch}
          >
            <StopIcon />
          </button>
        )}
      </div>
    </section>
  )
}
