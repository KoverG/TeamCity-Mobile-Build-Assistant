import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { BuildArtifactMatch } from '../../teamcity/BuildArtifactSearch'
import {
  isOpenTeamCityArtifactResponse,
  isOpenTeamCityBuildResponse,
  type OpenTeamCityArtifactRequest,
  type OpenTeamCityBuildRequest,
} from '../../teamcity/contracts'
import { toTrustedTeamCityUrl } from '../../teamcity/restPath'
import { AssistantPanel } from './AssistantPanel'
import { BuildResults, type AssistantToast } from './BuildResults'
import type { AssistantController } from './useAssistantController'

const resultsVisibleWidth = 341
const dragThreshold = 4

interface AssistantWorkspaceProps {
  id: string
  origin: string
  controller: AssistantController
  onClose(): void
}

interface ResultDrag {
  pointerId: number
  startX: number
  startProgress: number
  right: boolean
  moved: boolean
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function AssistantWorkspace({ id, origin, controller, onClose }: AssistantWorkspaceProps) {
  const [resultsOpen, setResultsOpen] = useState(false)
  const [resultsSession, setResultsSession] = useState(0)
  const [dragProgress, setDragProgress] = useState<number>()
  const [toast, setToast] = useState<AssistantToast>()
  const dragRef = useRef<ResultDrag | undefined>(undefined)
  const dragProgressRef = useRef<number | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const progress = dragProgress ?? (resultsOpen ? 1 : 0)

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
      const links = matches.map((match) => toTrustedTeamCityUrl(match.artifact.contentHref, origin))
      await navigator.clipboard.writeText(links.join('\n'))
      setToast({
        message: links.length === 1 ? 'Ссылка скопирована' : `Скопировано ссылок: ${links.length}`,
        tone: 'success',
      })
    } catch {
      setToast({ message: 'Не удалось скопировать', tone: 'error' })
    }
  }

  async function download(match: BuildArtifactMatch) {
    try {
      const request: OpenTeamCityArtifactRequest = {
        type: 'teamcity:open-artifact',
        contentHref: match.artifact.contentHref,
      }
      const response: unknown = await chrome.runtime.sendMessage(request)
      if (!isOpenTeamCityArtifactResponse(response) || !response.ok) {
        throw new Error('The artifact download could not be started.')
      }
      setToast({ message: 'Началась скачка', tone: 'success' })
    } catch {
      setToast({ message: 'Не удалось начать скачивание', tone: 'error' })
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
      setToast({ message: 'Не удалось открыть билд', tone: 'error' })
    }
  }

  function search() {
    if (!controller.canSearch || controller.state.searchStatus === 'loading') {
      return
    }
    setResultsOpen(true)
    void controller.search()
  }

  function updateResultsOpen(nextOpen: boolean) {
    if (resultsOpen && !nextOpen) {
      setResultsSession((session) => session + 1)
    }
    setResultsOpen(nextOpen)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startProgress: resultsOpen ? 1 : 0,
      right: event.currentTarget.closest('.tcba-shell--right') !== null,
      moved: false,
    }
    dragProgressRef.current = resultsOpen ? 1 : 0
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag === undefined || drag.pointerId !== event.pointerId) {
      return
    }
    const delta = event.clientX - drag.startX
    if (!drag.moved && Math.abs(delta) < dragThreshold) {
      return
    }
    drag.moved = true
    const direction = drag.right ? -1 : 1
    const nextProgress = clamp(drag.startProgress + delta * direction / resultsVisibleWidth)
    dragProgressRef.current = nextProgress
    setDragProgress(nextProgress)
    event.preventDefault()
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag === undefined || drag.pointerId !== event.pointerId) {
      return
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = undefined
    if (drag.moved) {
      const shouldOpen = event.type === 'pointercancel'
        ? drag.startProgress >= 0.5
        : (dragProgressRef.current ?? drag.startProgress) >= 0.5
      updateResultsOpen(shouldOpen)
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    dragProgressRef.current = undefined
    setDragProgress(undefined)
  }

  function toggleResults() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    updateResultsOpen(!resultsOpen)
  }

  return (
    <div
      className={`tcba-assistant-workspace${dragProgress !== undefined ? ' tcba-assistant-workspace--dragging' : ''}`}
      style={{
        '--tcba-results-progress': progress,
        '--tcba-results-expansion': `${progress * resultsVisibleWidth}px`,
        '--tcba-results-hidden-shift': `${(1 - progress) * resultsVisibleWidth}px`,
      } as CSSProperties}
    >
      <div className="tcba-results-clip">
        <div
          className="tcba-results-drawer"
          id={`${id}-results`}
          aria-hidden={!resultsOpen}
          inert={!resultsOpen}
        >
          <BuildResults
            key={resultsSession}
            status={controller.state.searchStatus}
            hasSearched={controller.state.hasSearched}
            errorMessage={controller.state.searchErrorMessage}
            matches={controller.state.matches}
            selectedBuildIds={controller.state.selectedBuildIds}
            toast={toast}
            onRetry={search}
            onToggle={controller.toggleBuild}
            onCopy={(matches) => void copyLinks(matches)}
            onDownload={(match) => void download(match)}
            onOpenBuild={(match) => void openBuild(match)}
          />
        </div>
      </div>
      <AssistantPanel id={id} controller={controller} onSearch={search} onClose={onClose} />
      <button
        className="tcba-results-handle"
        type="button"
        aria-controls={`${id}-results`}
        aria-expanded={resultsOpen}
        aria-label={resultsOpen ? 'Скрыть результаты поиска' : 'Показать результаты поиска'}
        title={resultsOpen ? 'Скрыть результаты' : 'Показать результаты'}
        onClick={toggleResults}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <svg aria-hidden="true" viewBox="1100 224.5 12.5 67" preserveAspectRatio="none">
          <path d="M1097.84 224.5C1101.6 224.5 1105.16 226.19 1107.53 229.104L1109.69 231.752C1111.51 233.982 1112.5 236.771 1112.5 239.648V276.352C1112.5 279.229 1111.51 282.018 1109.69 284.248L1107.53 286.896C1105.16 289.81 1101.6 291.5 1097.84 291.5H1079.5V224.5H1097.84Z" />
        </svg>
      </button>
    </div>
  )
}
