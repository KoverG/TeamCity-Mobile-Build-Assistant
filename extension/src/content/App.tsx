import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BuildConfigurationClassifier } from '../teamcity/BuildConfigurationClassifier'
import { createTeamCityService, type TeamCityService } from '../teamcity/TeamCityService'
import {
  ChromeLegacySelectionCleanup,
  type LegacySelectionCleanup,
} from '../storage/LegacySelectionCleanup'
import {
  ChromeSearchHistoryStorage,
  type SearchHistoryStorage,
} from '../storage/SearchHistoryStorage'
import type { LauncherStorage } from '../storage/LauncherStorage'
import {
  createAdditionalActionsService,
  type AdditionalActionsService,
} from '../additional-actions/AdditionalActionsService'
import { AdditionalActionsProvider } from './additional-actions/AdditionalActionsProvider'
import { AssistantWorkspace } from './assistant/AssistantWorkspace'
import { useAssistantController } from './assistant/useAssistantController'
import { TeamCityNavTab } from './TeamCityNavTab'

const panelId = 'teamcity-mobile-build-assistant-panel'

interface AppProps {
  service?: TeamCityService
  classifier?: BuildConfigurationClassifier
  legacySelectionCleanup?: LegacySelectionCleanup
  searchHistoryStorage?: SearchHistoryStorage
  launcherStorage?: LauncherStorage
  additionalActionsService?: AdditionalActionsService
  origin?: string
  auxiliaryPanel?: ReactNode
}

export function App({
  service,
  classifier,
  legacySelectionCleanup,
  searchHistoryStorage,
  launcherStorage,
  additionalActionsService,
  origin,
  auxiliaryPanel,
}: AppProps) {
  const teamCity = useMemo(() => service ?? createTeamCityService(), [service])
  const catalogClassifier = useMemo(
    () => classifier ?? new BuildConfigurationClassifier(),
    [classifier],
  )
  const selectionCleanup = useMemo(
    () => legacySelectionCleanup ?? new ChromeLegacySelectionCleanup(),
    [legacySelectionCleanup],
  )
  const historyStorage = useMemo(
    () => searchHistoryStorage ?? new ChromeSearchHistoryStorage(),
    [searchHistoryStorage],
  )
  const actionsService = useMemo(
    () => additionalActionsService ?? createAdditionalActionsService(),
    [additionalActionsService],
  )
  const runtimeOrigin = origin ?? window.location.origin
  const [isOpen, setIsOpen] = useState(false)
  const [workspaceSession, setWorkspaceSession] = useState(0)
  const resetWhenClosedSearchSettlesRef = useRef(false)
  const controller = useAssistantController({
    service: teamCity,
    classifier: catalogClassifier,
    historyStorage,
    origin: runtimeOrigin,
  })
  const { resetSession } = controller
  const searchStatus = controller.state.searchStatus

  useEffect(() => {
    void selectionCleanup.clear(runtimeOrigin).catch(() => undefined)
  }, [runtimeOrigin, selectionCleanup])

  useEffect(() => {
    if (
      isOpen ||
      !resetWhenClosedSearchSettlesRef.current ||
      searchStatus === 'loading'
    ) {
      return
    }
    resetWhenClosedSearchSettlesRef.current = false
    resetSession()
    setWorkspaceSession((session) => session + 1)
  }, [isOpen, resetSession, searchStatus])

  function closePanel() {
    if (searchStatus === 'loading') {
      resetWhenClosedSearchSettlesRef.current = true
    } else {
      resetWhenClosedSearchSettlesRef.current = false
      resetSession()
      setWorkspaceSession((session) => session + 1)
    }
    setIsOpen(false)
  }

  function togglePanel() {
    if (isOpen) {
      closePanel()
      return
    }
    resetWhenClosedSearchSettlesRef.current = false
    setIsOpen(true)
    if (controller.state.catalogStatus === 'idle') {
      void controller.loadCatalog()
    }
  }

  return (
    <AdditionalActionsProvider service={actionsService}>
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
          key={workspaceSession}
          id={panelId}
          origin={runtimeOrigin}
          controller={controller}
          onClose={closePanel}
        />
      </TeamCityNavTab>
    </AdditionalActionsProvider>
  )
}
