import { useMemo, useState, type ReactNode } from 'react'
import { BuildConfigurationClassifier } from '../teamcity/BuildConfigurationClassifier'
import { createTeamCityService, type TeamCityService } from '../teamcity/TeamCityService'
import { ChromeSelectionStorage, type SelectionStorage } from '../storage/SelectionStorage'
import type { LauncherStorage } from '../storage/LauncherStorage'
import { AssistantPanel } from './assistant/AssistantPanel'
import { useAssistantController } from './assistant/useAssistantController'
import { TeamCityNavTab } from './TeamCityNavTab'

const panelId = 'teamcity-mobile-build-assistant-panel'

interface AppProps {
  service?: TeamCityService
  classifier?: BuildConfigurationClassifier
  selectionStorage?: SelectionStorage
  launcherStorage?: LauncherStorage
  origin?: string
  auxiliaryPanel?: ReactNode
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
  const controller = useAssistantController({
    service: teamCity,
    classifier: catalogClassifier,
    storage,
    origin: runtimeOrigin,
  })

  function togglePanel() {
    if (isOpen) {
      setIsOpen(false)
      return
    }
    setIsOpen(true)
    void controller.loadCatalog()
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
      <AssistantPanel
        id={panelId}
        origin={runtimeOrigin}
        controller={controller}
        onClose={() => setIsOpen(false)}
      />
    </TeamCityNavTab>
  )
}
