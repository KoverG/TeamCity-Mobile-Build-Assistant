import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherStorage } from '../storage/LauncherStorage'
import { TeamCityNavTab } from './TeamCityNavTab'

function rectangle(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }
}

function createStorage(
  stored?: Awaited<ReturnType<LauncherStorage['load']>>,
): LauncherStorage & { save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn().mockResolvedValue(stored),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1200,
  })
  const navigation = document.createElement('header')
  navigation.dataset.testMainNav = 'true'
  document.body.append(navigation)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this instanceof HTMLElement && this.dataset.testMainNav === 'true') {
      return rectangle(0, 0, 72, 800)
    }
    if (this instanceof HTMLElement && this.classList.contains('tcba-nav-tab')) {
      const collapsed = this.classList.contains('tcba-nav-tab--collapsed')
      const width = collapsed ? 8 : 45
      const rightSide = this.closest('.tcba-shell')?.classList.contains('tcba-shell--right') ?? false
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      return rectangle(rightSide ? viewportWidth - width : 72, 320, width, collapsed ? 50 : 112)
    }
    return rectangle(0, 0, 0, 0)
  })
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('TeamCityNavTab', () => {
  it('opens the panel and requires a separate click after compact expansion', async () => {
    const onTogglePanel = vi.fn()
    const onCollapse = vi.fn()
    const storage = createStorage()
    render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={true}
        storage={storage}
        onTogglePanel={onTogglePanel}
        onCollapse={onCollapse}
      >
        <div id="synthetic-panel">Synthetic panel</div>
      </TeamCityNavTab>,
    )

    const mainButton = screen.getByRole('button', { name: 'Закрыть Mobile Build Assistant' })
    fireEvent.pointerDown(mainButton, { pointerId: 1, button: 0, clientY: 330 })
    fireEvent.pointerMove(mainButton, { pointerId: 1, clientY: 530 })
    fireEvent.pointerUp(mainButton, { pointerId: 1, clientY: 530 })
    expect(storage.save).not.toHaveBeenCalled()

    fireEvent.click(mainButton)
    expect(onTogglePanel).toHaveBeenCalledTimes(1)

    const collapseButton = screen.getByRole('button', {
      name: 'Свернуть хлястик Mobile Build Assistant',
    })
    fireEvent.pointerDown(collapseButton, { pointerId: 2, button: 0, clientY: 390 })
    fireEvent.pointerUp(collapseButton, { pointerId: 2, clientY: 390 })
    fireEvent.click(collapseButton)
    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Synthetic panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Развернуть и переместить хлястик Mobile Build Assistant',
    }))
    expect(await screen.findByRole('button', { name: 'Закрыть Mobile Build Assistant' })).toBeVisible()
    expect(onTogglePanel).toHaveBeenCalledTimes(1)
  })

  it('restores and persists the compact state for the current origin', async () => {
    const storage = createStorage({ positionRatio: 0.7, collapsed: true, side: 'left' })
    render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={storage}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', {
      name: 'Развернуть и переместить хлястик Mobile Build Assistant',
    }))

    await waitFor(() => {
      expect(storage.save).toHaveBeenCalledWith('https://teamcity.example.test', {
        positionRatio: 0.7,
        collapsed: false,
        side: 'left',
      })
    })
  })

  it('moves within the navigation bounds with pointer and keyboard input', async () => {
    const storage = createStorage()
    render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={storage}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Переместить хлястик Mobile Build Assistant' })
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 360 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 600 })
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 600 })

    await waitFor(() => {
      expect(storage.save).toHaveBeenCalledWith(
        'https://teamcity.example.test',
        expect.objectContaining({ collapsed: false }),
      )
    })
    const pointerPreferences = vi.mocked(storage.save).mock.calls.at(-1)?.[1]
    expect(pointerPreferences?.positionRatio).toBeGreaterThan(0.7)
    expect(pointerPreferences?.positionRatio).toBeLessThanOrEqual(1)

    fireEvent.keyDown(grip, { key: 'Home' })
    await waitFor(() => {
      expect(storage.save).toHaveBeenLastCalledWith('https://teamcity.example.test', {
        positionRatio: 0,
        collapsed: false,
        side: 'left',
      })
    })
  })

  it('ignores horizontal drift smaller than the expanded tab width', async () => {
    const storage = createStorage()
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={storage}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell') as HTMLElement
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--anchored'))

    const grip = screen.getByRole('button', { name: 'Переместить хлястик Mobile Build Assistant' })
    fireEvent.pointerDown(grip, { pointerId: 2, button: 0, clientX: 130, clientY: 360 })
    fireEvent.pointerMove(grip, { pointerId: 2, clientX: 174, clientY: 520 })
    fireEvent.pointerUp(grip, { pointerId: 2, clientX: 174, clientY: 520 })

    await waitFor(() => {
      expect(storage.save).toHaveBeenLastCalledWith(
        'https://teamcity.example.test',
        expect.objectContaining({ side: 'left' }),
      )
    })
    expect(shell).toHaveClass('tcba-shell--left')
    expect(shell).not.toHaveClass('tcba-shell--detached')
    expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('72px')
  })

  it('returns to the left anchor when a detached tab is released before the viewport midpoint', async () => {
    const storage = createStorage()
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={storage}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell') as HTMLElement
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--anchored'))

    const grip = screen.getByRole('button', { name: 'Переместить хлястик Mobile Build Assistant' })
    fireEvent.pointerDown(grip, { pointerId: 3, button: 0, clientX: 130, clientY: 360 })
    fireEvent.pointerMove(grip, { pointerId: 3, clientX: 300, clientY: 420 })
    expect(shell).toHaveClass('tcba-shell--detached')
    fireEvent.pointerUp(grip, { pointerId: 3, clientX: 500, clientY: 420 })

    await waitFor(() => {
      expect(shell).toHaveClass('tcba-shell--left')
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('72px')
      expect(storage.save).toHaveBeenLastCalledWith(
        'https://teamcity.example.test',
        expect.objectContaining({ side: 'left' }),
      )
    })
  })

  it('docks beyond the viewport midpoint and supports the mirrored return gesture', async () => {
    const storage = createStorage()
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={storage}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell') as HTMLElement
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--anchored'))

    const grip = screen.getByRole('button', { name: 'Переместить хлястик Mobile Build Assistant' })
    fireEvent.pointerDown(grip, { pointerId: 4, button: 0, clientX: 130, clientY: 360 })
    fireEvent.pointerMove(grip, { pointerId: 4, clientX: 900, clientY: 420 })
    fireEvent.pointerUp(grip, { pointerId: 4, clientX: 900, clientY: 420 })

    await waitFor(() => {
      expect(shell).toHaveClass('tcba-shell--right')
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('1155px')
      expect(storage.save).toHaveBeenLastCalledWith(
        'https://teamcity.example.test',
        expect.objectContaining({ side: 'right' }),
      )
    })

    fireEvent.pointerDown(grip, { pointerId: 5, button: 0, clientX: 1140, clientY: 420 })
    fireEvent.pointerMove(grip, { pointerId: 5, clientX: 500, clientY: 440 })
    fireEvent.pointerUp(grip, { pointerId: 5, clientX: 500, clientY: 440 })

    await waitFor(() => {
      expect(shell).toHaveClass('tcba-shell--left')
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('72px')
      expect(storage.save).toHaveBeenLastCalledWith(
        'https://teamcity.example.test',
        expect.objectContaining({ side: 'left' }),
      )
    })
  })

  it('reattaches after TeamCity replaces the navigation header', async () => {
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={createStorage()}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell')
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--anchored'))
    expect((shell as HTMLElement).style.getPropertyValue('--tcba-shell-left')).toBe('72px')
    expect(Number.parseFloat((shell as HTMLElement).style.getPropertyValue('--tcba-shell-top')))
      .toBeCloseTo(309.6)

    document.querySelector('header[data-test-main-nav="true"]')?.remove()
    await waitFor(() => expect(shell).not.toHaveClass('tcba-shell--anchored'))

    const replacement = document.createElement('header')
    replacement.dataset.testMainNav = 'true'
    document.body.append(replacement)
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--anchored'))
  })

  it('docks before the vertical scrollbar and follows changes of the content viewport', async () => {
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={createStorage({ positionRatio: 0.45, collapsed: false, side: 'right' })}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell') as HTMLElement
    await waitFor(() => {
      expect(shell).toHaveClass('tcba-shell--right')
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('1155px')
    })

    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1184,
    })
    fireEvent(window, new Event('resize'))

    await waitFor(() => {
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('1139px')
    })
  })

  it('anchors by the target state instead of chasing an intermediate animated size', async () => {
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={createStorage({ positionRatio: 0.45, collapsed: false, side: 'right' })}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )
    const shell = container.querySelector('.tcba-shell') as HTMLElement
    await waitFor(() => expect(shell).toHaveClass('tcba-shell--right'))

    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.testMainNav === 'true') {
        return rectangle(0, 0, 72, 800)
      }
      if (this instanceof HTMLElement && this.classList.contains('tcba-nav-tab')) {
        return rectangle(1160, 320, 28, 75)
      }
      return rectangle(0, 0, 0, 0)
    })
    fireEvent(window, new Event('resize'))

    await waitFor(() => {
      expect(shell.style.getPropertyValue('--tcba-shell-left')).toBe('1155px')
      expect(Number.parseFloat(shell.style.getPropertyValue('--tcba-shell-top'))).toBeCloseTo(309.6)
    })
  })

  it('uses the exact Figma-exported body and control geometry', async () => {
    const { container } = render(
      <TeamCityNavTab
        origin="https://teamcity.example.test"
        panelId="synthetic-panel"
        panelOpen={false}
        storage={createStorage()}
        onTogglePanel={vi.fn()}
        onCollapse={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.tcba-shell')).toHaveClass('tcba-shell--anchored')
    })
    expect(container.querySelector('.tcba-nav-tab__shape')).toHaveAttribute('viewBox', '0 0 45 112')
    expect(container.querySelector('.tcba-tab__main-visual')).toHaveAttribute(
      'viewBox',
      '3.65381 13.7822 30 30',
    )
  })
})
