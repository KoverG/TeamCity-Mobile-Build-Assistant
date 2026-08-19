import { useMemo, useState, type ReactNode } from 'react'
import { BuildConfigurationClassifier } from '../teamcity/BuildConfigurationClassifier'
import { createTeamCityService, type TeamCityService } from '../teamcity/TeamCityService'
import { ChromeSelectionStorage, type SelectionStorage } from '../storage/SelectionStorage'
import {
  ChromeSearchHistoryStorage,
  type SearchHistoryStorage,
} from '../storage/SearchHistoryStorage'
import type { LauncherStorage } from '../storage/LauncherStorage'
import { AssistantWorkspace } from './assistant/AssistantWorkspace'
import { useAssistantController } from './assistant/useAssistantController'
import { TeamCityNavTab } from './TeamCityNavTab'

const panelId = 'teamcity-mobile-build-assistant-panel'

interface AppProps {
  service?: TeamCityService
  classifier?: BuildConfigurationClassifier
  selectionStorage?: SelectionStorage
  searchHistoryStorage?: SearchHistoryStorage
  launcherStorage?: LauncherStorage
  origin?: string
  auxiliaryPanel?: ReactNode
}

export function App({
  service,
  classifier,
  selectionStorage,
  searchHistoryStorage,
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
  const historyStorage = useMemo(
    () => searchHistoryStorage ?? new ChromeSearchHistoryStorage(),
    [searchHistoryStorage],
  )
  const runtimeOrigin = origin ?? window.location.origin
  const [isOpen, setIsOpen] = useState(false)
  const controller = useAssistantController({
    service: teamCity,
    classifier: catalogClassifier,
    storage,
    historyStorage,
    origin: runtimeOrigin,
  })

  function closePanel() {
    controller.discardDraftChanges()
    setIsOpen(false)
  }

  function togglePanel() {
    if (isOpen) {
      closePanel()
      return
    }
    setIsOpen(true)
    if (controller.state.catalogStatus === 'idle') {
      void controller.loadCatalog()
    }
  }

  return (
    <TeamCityNavTab
      origin={runtimeOrigin}
      panelId={panelId}
      panelOpen={isOpen}
      storage={launcherStorage}
      auxiliaryPanel={auxiliaryPanel}
      onTogglePanel={togglePanel}
      onCollapse={closePanel}
    >
      <AssistantWorkspace
        id={panelId}
        origin={runtimeOrigin}
        controller={controller}
        onClose={closePanel}
      />
    </TeamCityNavTab>
  )
}
