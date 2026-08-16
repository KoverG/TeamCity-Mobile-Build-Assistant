import { useEffect, useRef, useState } from 'react'
import {
  CloseIcon,
  MenuIcon,
  ProductLogoIcon,
  RefreshIcon,
  SettingsIcon,
  TelegramIcon,
  ThemeAlternateIcon,
  ThemeIcon,
} from './Icons'
import { IconButton } from './IconButton'

interface PanelToolbarProps {
  refreshEnabled: boolean
  loading: boolean
  onRefresh(): void
  onClose(): void
}

export function PanelToolbar({
  refreshEnabled,
  loading,
  onRefresh,
  onClose,
}: PanelToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const themeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!themeOpen) {
      return
    }
    const closeOutside = (event: PointerEvent) => {
      if (themeRef.current !== null && !event.composedPath().includes(themeRef.current)) {
        setThemeOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [themeOpen])

  return (
    <header className="tcba-toolbar">
      <span className="tcba-toolbar__handle" aria-hidden="true" />
      <span className="tcba-toolbar__logo" aria-hidden="true">
        <ProductLogoIcon />
      </span>
      <div className="tcba-toolbar__actions">
        <IconButton
          className="tcba-icon-button--refresh"
          label="Обновить список проектов"
          tone={refreshEnabled ? 'primary' : 'muted'}
          disabled={!refreshEnabled || loading}
          aria-busy={loading}
          onClick={onRefresh}
        >
          <RefreshIcon className={loading ? 'tcba-icon--spinning' : undefined} />
        </IconButton>

        <div
          className={`tcba-toolbar__extras${settingsOpen ? ' tcba-toolbar__extras--open' : ''}`}
          aria-hidden={!settingsOpen}
        >
          <div className="tcba-toolbar__extras-track">
            <IconButton
              label="Telegram — скоро"
              tone="primary"
              decorative
            >
              <TelegramIcon />
            </IconButton>
            <div
              className={`tcba-theme-menu${themeOpen ? ' tcba-theme-menu--open' : ''}`}
              ref={themeRef}
            >
              <IconButton
                label="Выбрать тему"
                tone="primary"
                aria-expanded={themeOpen}
                tabIndex={settingsOpen ? undefined : -1}
                onClick={() => setThemeOpen((open) => !open)}
              >
                <ThemeIcon />
              </IconButton>
              <button
                className="tcba-theme-menu__alternate"
                type="button"
                aria-label="Тёмная тема — скоро"
                aria-disabled="true"
                tabIndex={-1}
              >
                <ThemeAlternateIcon />
              </button>
            </div>
            <IconButton
              label="Меню настроек — скоро"
              tone="primary"
              decorative
            >
              <MenuIcon />
            </IconButton>
          </div>
        </div>

        <IconButton
          className="tcba-toolbar__settings"
          label={settingsOpen ? 'Закрыть настройки' : 'Открыть настройки'}
          tone="primary"
          aria-expanded={settingsOpen}
          onClick={() => {
            setSettingsOpen((open) => !open)
            setThemeOpen(false)
          }}
        >
          <SettingsIcon className={settingsOpen ? 'tcba-icon--settings-open' : undefined} />
        </IconButton>
        <IconButton className="tcba-toolbar__close" label="Закрыть панель" tone="primary" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
    </header>
  )
}
