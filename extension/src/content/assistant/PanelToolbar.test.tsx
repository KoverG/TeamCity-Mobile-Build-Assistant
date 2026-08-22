import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavTabMainButtonVisual } from '../TeamCityNavTabVisual'
import { PanelToolbar } from './PanelToolbar'

afterEach(() => {
  cleanup()
})

describe('PanelToolbar', () => {
  it('reuses the launcher product mark and the exact compact Case-2 action assets', () => {
    const panel = render(
      <PanelToolbar
        refreshEnabled
        loading
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const panelLogoPaths = [...panel.container.querySelectorAll('.tcba-toolbar__logo path')]
      .map((path) => path.getAttribute('d'))
    const launcher = render(<NavTabMainButtonVisual />)
    const launcherPaths = [...launcher.container.querySelectorAll('path')]
      .map((path) => path.getAttribute('d'))

    expect(panelLogoPaths).toEqual(launcherPaths)
    expect(screen.getByRole('button', { name: 'Обновить список проектов' }).querySelector('svg'))
      .toHaveAttribute('viewBox', '307 40 24 24')
    expect(screen.getByRole('button', { name: 'Обновить список проектов' }))
      .toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Обновить список проектов' }).querySelector('svg'))
      .toHaveClass('tcba-icon--spinning')
    expect(screen.getByRole('button', { name: 'Закрыть панель' }).querySelector('svg'))
      .toHaveAttribute('viewBox', '379 40 24 24')
  })

  it('keeps the product logo and reveals settings controls from their collapsed layer', () => {
    const { container } = render(
      <PanelToolbar
        refreshEnabled
        loading={false}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const extras = container.querySelector('.tcba-toolbar__extras')
    expect(container.querySelector('.tcba-toolbar__logo svg')).toBeInTheDocument()
    expect(extras).toHaveAttribute('aria-hidden', 'true')
    expect(extras).not.toHaveClass('tcba-toolbar__extras--open')
    expect(extras).toHaveStyle('--tcba-toolbar-extra-count: 2')

    fireEvent.click(screen.getByRole('button', { name: 'Открыть настройки' }))

    expect(container.querySelector('.tcba-toolbar__logo svg')).toBeInTheDocument()
    expect(extras).toHaveAttribute('aria-hidden', 'false')
    expect(extras).toHaveClass('tcba-toolbar__extras--open')
    expect(container.querySelectorAll('.tcba-toolbar__extras-track')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть настройки' }))

    expect(extras).toHaveAttribute('aria-hidden', 'true')
    expect(extras).not.toHaveClass('tcba-toolbar__extras--open')
    expect(container.querySelector('.tcba-icon--settings-open')).not.toBeInTheDocument()
  })

  it('slides out only one additional theme option with the separate mockup icon', () => {
    const { container } = render(
      <PanelToolbar
        refreshEnabled
        loading={false}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Открыть настройки' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать тему' }))

    const themeMenu = container.querySelector('.tcba-theme-menu')
    const alternate = screen.getByRole('button', { name: 'Тёмная тема — скоро' })
    const mainPath = screen.getByRole('button', { name: 'Выбрать тему' }).querySelector('path')
    const alternatePath = alternate.querySelector('path')

    expect(themeMenu).toHaveClass('tcba-theme-menu--open')
    expect(container.querySelectorAll('.tcba-theme-menu__alternate')).toHaveLength(1)
    expect(alternate).toHaveAttribute('aria-disabled', 'true')
    expect(alternatePath?.getAttribute('d')).not.toBe(mainPath?.getAttribute('d'))
  })
})
