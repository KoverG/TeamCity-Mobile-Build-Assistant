import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ChromeLauncherStorage,
  type LauncherPreferences,
  type LauncherSide,
  type LauncherStorage,
} from '../storage/LauncherStorage'
import { navTabGeometry } from './TeamCityNavTabGeometry'
import {
  NavTabBodyShape,
  NavTabCollapseVisual,
  NavTabMainButtonVisual,
} from './TeamCityNavTabVisual'

const defaultNavigationSelector = 'header[data-test-main-nav="true"]'
const defaultPositionRatio = 0.45
const keyboardStepPixels = 16
const dragThresholdPixels = 4
const horizontalDetachThresholdPixels = navTabGeometry.expandedWidth

interface TeamCityNavTabProps {
  origin: string
  panelId: string
  panelOpen: boolean
  storage?: LauncherStorage
  navigationSelector?: string
  auxiliaryPanel?: ReactNode
  children?: ReactNode
  onTogglePanel(): void
  onCollapse(): void
}

interface DragState {
  pointerId: number
  pointerOffsetX: number
  pointerOffsetY: number
  startClientX: number
  startClientY: number
  startSide: LauncherSide
  detached: boolean
  moved: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function contentViewportWidth(): number {
  const documentWidth = document.documentElement.clientWidth
  return documentWidth > 0
    ? Math.min(window.innerWidth, documentWidth)
    : window.innerWidth
}

function targetTabSize(tab: HTMLElement): { width: number; height: number } {
  return tab.classList.contains('tcba-nav-tab--collapsed')
    ? { width: navTabGeometry.collapsedWidth, height: navTabGeometry.collapsedHeight }
    : { width: navTabGeometry.expandedWidth, height: navTabGeometry.expandedHeight }
}

export function TeamCityNavTab({
  origin,
  panelId,
  panelOpen,
  storage,
  navigationSelector = defaultNavigationSelector,
  auxiliaryPanel,
  children,
  onTogglePanel,
  onCollapse,
}: TeamCityNavTabProps) {
  const preferencesStorage = useMemo(
    () => storage ?? new ChromeLauncherStorage(),
    [storage],
  )
  const shellRef = useRef<HTMLElement>(null)
  const tabRef = useRef<HTMLDivElement>(null)
  const navigationRef = useRef<HTMLElement | null>(null)
  const positionRatioRef = useRef(defaultPositionRatio)
  const sideRef = useRef<LauncherSide>('left')
  const floatingLeftRef = useRef<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const [positionRatio, setPositionRatio] = useState(defaultPositionRatio)
  const [collapsed, setCollapsed] = useState(false)
  const [side, setSide] = useState<LauncherSide>('left')
  const [anchorReady, setAnchorReady] = useState(false)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [detached, setDetached] = useState(false)

  const updateGeometry = useCallback(() => {
    const shell = shellRef.current
    const tab = tabRef.current
    const navigation = navigationRef.current
    if (shell === null || tab === null || navigation === null || !navigation.isConnected) {
      setAnchorReady(false)
      return
    }

    const navigationRect = navigation.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    if (navigationRect.width <= 0 || navigationRect.height <= 0 || tabRect.height <= 0) {
      setAnchorReady(false)
      return
    }

    const tabSize = targetTabSize(tab)
    const availableHeight = Math.max(0, navigationRect.height - tabSize.height)
    const top = navigationRect.top + availableHeight * positionRatioRef.current
    const viewportWidth = contentViewportWidth()
    const dockedLeft = sideRef.current === 'left'
      ? navigationRect.right
      : Math.max(0, viewportWidth - tabSize.width)
    const left = floatingLeftRef.current ?? dockedLeft
    const availableWidth = sideRef.current === 'left'
      ? Math.max(0, viewportWidth - left - tabSize.width - 24)
      : Math.max(0, left - 24)
    shell.style.setProperty('--tcba-shell-left', `${left}px`)
    shell.style.setProperty('--tcba-shell-top', `${top}px`)
    shell.style.setProperty('--tcba-panel-stack-available', `${availableWidth}px`)
    setAnchorReady(true)
  }, [])

  useEffect(() => {
    let active = true
    void preferencesStorage.load(origin)
      .then((preferences) => {
        if (!active || preferences === undefined) {
          return
        }
        positionRatioRef.current = preferences.positionRatio
        sideRef.current = preferences.side
        setPositionRatio(preferences.positionRatio)
        setCollapsed(preferences.collapsed)
        setSide(preferences.side)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setPreferencesReady(true)
        }
      })

    return () => {
      active = false
    }
  }, [origin, preferencesStorage])

  useEffect(() => {
    let animationFrame: number | undefined
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => scheduleGeometryUpdate())

    function scheduleGeometryUpdate() {
      if (typeof window.requestAnimationFrame !== 'function') {
        updateGeometry()
        return
      }
      if (animationFrame !== undefined && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animationFrame)
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = undefined
        updateGeometry()
      })
    }

    function attachToNavigation() {
      const nextNavigation = document.querySelector<HTMLElement>(navigationSelector)
      if (navigationRef.current === nextNavigation) {
        scheduleGeometryUpdate()
        return
      }

      if (navigationRef.current !== null) {
        resizeObserver?.unobserve(navigationRef.current)
      }
      navigationRef.current = nextNavigation
      if (nextNavigation !== null) {
        resizeObserver?.observe(nextNavigation)
      }
      scheduleGeometryUpdate()
    }

    if (tabRef.current !== null) {
      resizeObserver?.observe(tabRef.current)
    }
    resizeObserver?.observe(document.documentElement)
    const mutationObserver = new MutationObserver(() => {
      if (navigationRef.current === null || !navigationRef.current.isConnected) {
        attachToNavigation()
      }
    })
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('resize', scheduleGeometryUpdate)
    document.addEventListener('scroll', scheduleGeometryUpdate, true)
    attachToNavigation()

    return () => {
      if (animationFrame !== undefined && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animationFrame)
      }
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleGeometryUpdate)
      document.removeEventListener('scroll', scheduleGeometryUpdate, true)
      navigationRef.current = null
    }
  }, [navigationSelector, updateGeometry])

  useEffect(() => {
    positionRatioRef.current = positionRatio
    sideRef.current = side
    updateGeometry()
  }, [collapsed, positionRatio, side, updateGeometry])

  function savePreferences(preferences: LauncherPreferences) {
    void preferencesStorage.save(origin, preferences).catch(() => undefined)
  }

  function updatePositionFromTop(top: number): number | undefined {
    const navigation = navigationRef.current
    const tab = tabRef.current
    if (navigation === null || tab === null) {
      return undefined
    }

    const navigationRect = navigation.getBoundingClientRect()
    const tabHeight = targetTabSize(tab).height
    const availableHeight = Math.max(0, navigationRect.height - tabHeight)
    const nextTop = clamp(top, navigationRect.top, navigationRect.top + availableHeight)
    const nextRatio = availableHeight === 0 ? 0 : (nextTop - navigationRect.top) / availableHeight
    positionRatioRef.current = nextRatio
    setPositionRatio(nextRatio)
    updateGeometry()
    return nextRatio
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }
    const tab = tabRef.current
    if (tab === null) {
      return
    }
    const tabRect = tab.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      pointerOffsetX: event.clientX - tabRect.left,
      pointerOffsetY: event.clientY - tabRect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSide: sideRef.current,
      detached: false,
      moved: false,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) {
      return
    }
    const horizontalDelta = event.clientX - drag.startClientX
    const verticalDelta = event.clientY - drag.startClientY
    if (
      !drag.moved
      && Math.max(Math.abs(horizontalDelta), Math.abs(verticalDelta)) < dragThresholdPixels
    ) {
      return
    }

    drag.moved = true
    const outwardHorizontalDelta = drag.startSide === 'left'
      ? horizontalDelta
      : -horizontalDelta
    if (!drag.detached && outwardHorizontalDelta >= horizontalDetachThresholdPixels) {
      drag.detached = true
      setDetached(true)
    }
    if (drag.detached) {
      const tab = tabRef.current
      if (tab !== null) {
        floatingLeftRef.current = clamp(
          event.clientX - drag.pointerOffsetX,
          0,
          Math.max(0, contentViewportWidth() - targetTabSize(tab).width),
        )
      }
    }
    updatePositionFromTop(event.clientY - drag.pointerOffsetY)
    event.preventDefault()
  }

  function finishPointerInteraction(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) {
      return
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    setDragging(false)
    setDetached(false)
    if (drag.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      const nextSide = drag.detached && event.type !== 'pointercancel'
        ? (event.clientX >= contentViewportWidth() / 2 ? 'right' : 'left')
        : drag.startSide
      sideRef.current = nextSide
      floatingLeftRef.current = null
      setSide(nextSide)
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => updateGeometry())
      } else {
        updateGeometry()
      }
      savePreferences({ positionRatio: positionRatioRef.current, collapsed, side: nextSide })
    } else {
      floatingLeftRef.current = null
    }
  }

  function consumeSuppressedClick(): boolean {
    if (!suppressClickRef.current) {
      return false
    }
    suppressClickRef.current = false
    return true
  }

  function collapseTab() {
    setCollapsed(true)
    onCollapse()
    savePreferences({ positionRatio: positionRatioRef.current, collapsed: true, side: sideRef.current })
  }

  function expandTab() {
    if (consumeSuppressedClick()) {
      return
    }
    setCollapsed(false)
    savePreferences({ positionRatio: positionRatioRef.current, collapsed: false, side: sideRef.current })
  }

  function togglePanel() {
    onTogglePanel()
  }

  function handleKeyboardMove(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const navigation = navigationRef.current
    const tab = tabRef.current
    if (navigation === null || tab === null) {
      return
    }

    const availableHeight = Math.max(
      0,
      navigation.getBoundingClientRect().height - tab.getBoundingClientRect().height,
    )
    let nextRatio: number | undefined
    if (event.key === 'Home') {
      nextRatio = 0
    } else if (event.key === 'End') {
      nextRatio = 1
    } else if (event.key === 'ArrowUp' && availableHeight > 0) {
      nextRatio = positionRatioRef.current - keyboardStepPixels / availableHeight
    } else if (event.key === 'ArrowDown' && availableHeight > 0) {
      nextRatio = positionRatioRef.current + keyboardStepPixels / availableHeight
    }

    if (nextRatio === undefined) {
      return
    }
    event.preventDefault()
    const clampedRatio = clamp(nextRatio, 0, 1)
    positionRatioRef.current = clampedRatio
    setPositionRatio(clampedRatio)
    savePreferences({ positionRatio: clampedRatio, collapsed, side: sideRef.current })
  }

  return (
    <aside
      ref={shellRef}
      className={`tcba-shell${anchorReady && preferencesReady ? ' tcba-shell--anchored' : ''}${
        positionRatio > 0.5 ? ' tcba-shell--lower' : ''
      }${collapsed ? ' tcba-shell--collapsed' : ''}${
        side === 'right' ? ' tcba-shell--right' : ' tcba-shell--left'
      }${dragging ? ' tcba-shell--dragging' : ''}${detached ? ' tcba-shell--detached' : ''}`}
      aria-label="TeamCity Mobile Build Assistant"
      style={{
        '--tcba-tab-expanded-width': `${navTabGeometry.expandedWidth}px`,
        '--tcba-tab-expanded-height': `${navTabGeometry.expandedHeight}px`,
        '--tcba-tab-collapsed-width': `${navTabGeometry.collapsedWidth}px`,
        '--tcba-tab-collapsed-height': `${navTabGeometry.collapsedHeight}px`,
      } as CSSProperties}
    >
      <div
        ref={tabRef}
        className={`tcba-nav-tab${collapsed ? ' tcba-nav-tab--collapsed' : ''}${
          dragging ? ' tcba-nav-tab--dragging' : ''
        }`}
        role="group"
        aria-label="Перемещаемый хлястик Mobile Build Assistant"
      >
        <NavTabBodyShape />
        <div className="tcba-tab__expanded" aria-hidden={collapsed}>
          <button
            className="tcba-tab__button tcba-launcher"
            type="button"
            tabIndex={collapsed ? -1 : 0}
            aria-expanded={panelOpen}
            aria-controls={panelId}
            aria-label={panelOpen ? 'Закрыть Mobile Build Assistant' : 'Открыть Mobile Build Assistant'}
            onClick={togglePanel}
          >
            <NavTabMainButtonVisual />
          </button>
          <button
            className="tcba-tab__button tcba-tab__button--collapse"
            type="button"
            tabIndex={collapsed ? -1 : 0}
            aria-label="Свернуть хлястик Mobile Build Assistant"
            onClick={collapseTab}
          >
            <NavTabCollapseVisual />
          </button>
        </div>
        <button
          className="tcba-tab__grip"
          type="button"
          aria-label={collapsed
            ? 'Развернуть и переместить хлястик Mobile Build Assistant'
            : 'Переместить хлястик Mobile Build Assistant'}
          aria-expanded={!collapsed}
          onClick={collapsed ? expandTab : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          onKeyDown={handleKeyboardMove}
        >
          <span className="tcba-tab__grip-bar" aria-hidden="true" />
        </button>
      </div>

      {!collapsed && panelOpen && (
        <div className="tcba-panel-stack">
          {children}
          {auxiliaryPanel}
        </div>
      )}
    </aside>
  )
}
