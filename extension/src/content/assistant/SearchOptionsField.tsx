import { useEffect, useRef, useState } from 'react'
import { contentAssetUrl } from '../assetUrl'
import type { BuildSearchMode } from '../../teamcity/BuildSearch'
import type { SearchHistory } from '../../storage/SearchHistoryStorage'
import {
  BuildNumberSearchIcon,
  CloseIcon,
  SearchIcon,
  StopIcon,
  TaskBranchSearchIcon,
} from './Icons'
import { SearchOptionsRefreshIcon, TrashIcon } from './SearchDropdownIcons'
import type { BuildSearchOptionsStatus } from './useBuildSearchOptions'
import { eventPathContains } from './eventPath'
import { OverlayScrollbar } from './ScrollArea'
import waitingLoaderAsset from './assets/blocks-shuffle-4.svg'
import { useScrollMetrics } from './useScrollMetrics'

type SearchOptionsSource = 'current' | 'history'

interface SearchOptionsFieldProps {
  currentOptions: readonly string[]
  currentOptionsErrorMessage?: string
  currentOptionsStatus: BuildSearchOptionsStatus
  disabled: boolean
  projectSelected: boolean
  history: SearchHistory
  mode: BuildSearchMode
  onClearHistory(mode: BuildSearchMode): void
  onDropdownClose(): void
  onModeChange(mode: BuildSearchMode): void
  onQueryChange(mode: BuildSearchMode, query: string): void
  onRefresh(): void
  onSearch(): void
  onStop(): void
  queries: Record<BuildSearchMode, string>
}

const modeLabels: Record<BuildSearchMode, string> = {
  task: 'Поиск по номеру задачи',
  build: 'Поиск по номеру билда',
}
const waitingLoaderUrl = contentAssetUrl(waitingLoaderAsset)


export function SearchOptionsField({
  currentOptions,
  currentOptionsErrorMessage,
  currentOptionsStatus,
  disabled,
  projectSelected,
  history,
  mode,
  onClearHistory,
  onDropdownClose,
  onModeChange,
  onQueryChange,
  onRefresh,
  onSearch,
  onStop,
  queries,
}: SearchOptionsFieldProps) {
  const controlRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<SearchOptionsSource>('current')
  const query = queries[mode]
  const loading = currentOptionsStatus === 'loading'
  const activeItems = source === 'current'
    ? (currentOptionsStatus === 'error' ? [] : currentOptions)
    : history[mode]
  const visibleItems = source === 'current' && loading
    ? activeItems.slice(0, 4)
    : activeItems

  const scrollbar = useScrollMetrics(listRef, `${open}:${source}:${visibleItems.length}:${loading}`)
  function closeDropdown() {
    if (!open) {
      return
    }
    setOpen(false)
    if (loading) {
      onDropdownClose()
    }
  }
  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const control = controlRef.current
      const dropdown = dropdownRef.current
      const insideControl = control !== null && eventPathContains(event, control)
      const insideDropdown = dropdown !== null && eventPathContains(event, dropdown)

      if (open && !insideControl && !insideDropdown) {
        closeDropdown()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  })

  function selectMode(nextMode: BuildSearchMode) {
    const resolvedMode = nextMode === mode
      ? (mode === 'task' ? 'build' : 'task')
      : nextMode
    closeDropdown()
    setSource('current')
    onModeChange(resolvedMode)
  }

  function selectItem(item: string) {
    onQueryChange(mode, item)
    closeDropdown()
  }

  const emptyMessage = source === 'current' && currentOptionsStatus === 'error'
    ? currentOptionsErrorMessage ?? 'Не удалось прочитать данные TeamCity.'
    : source === 'current' && !projectSelected
      ? 'НЕ ВЫБРАН ПРОЕКТ'
      : 'НЕТ ДАННЫХ'

  return (
    <div className={`tcba-search-field${open ? ' tcba-search-field--open' : ''}`}>
      <div className="tcba-search-field__header">
        <span className="tcba-field-label">Поиск</span>
        <span
          className={`tcba-search-field__modes tcba-search-field__modes--${mode}`}
          role="group"
          aria-label="Режим поиска"
        >
          <button
            type="button"
            aria-label="Искать по номеру билда"
            title="По номеру билда"
            aria-pressed={mode === 'build'}
            disabled={disabled}
            onClick={() => selectMode('build')}
          >
            <BuildNumberSearchIcon />
          </button>
          <button
            type="button"
            aria-label="Искать по номеру задачи в ветке"
            title="По номеру задачи"
            aria-pressed={mode === 'task'}
            disabled={disabled}
            onClick={() => selectMode('task')}
          >
            <TaskBranchSearchIcon />
          </button>
        </span>
      </div>
      <div className="tcba-search-field__control" ref={controlRef}>
        <SearchIcon className="tcba-search-field__search-icon" />
        <input
          type="text"
          value={query}
          maxLength={128}
          disabled={disabled}
          aria-label={modeLabels[mode]}
          placeholder={mode === 'task' ? 'Поиск по ветке задачи...' : 'Поиск по номеру билда...'}
          onChange={(event) => onQueryChange(mode, event.currentTarget.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              closeDropdown()
              onSearch()
            } else if (event.key === 'Escape') {
              closeDropdown()
            }
          }}
        />
        {query.length > 0 && (
          <button
            className="tcba-search-field__clear"
            type="button"
            aria-label="Очистить текущий поисковый запрос"
            title="Очистить запрос"
            onClick={() => onQueryChange(mode, '')}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {open && (
        <div className="tcba-field-dropdown tcba-search-options" ref={dropdownRef}>
          <div className="tcba-search-options__sources" role="tablist" aria-label="Источник вариантов">
            <div className={`tcba-search-options__chip${source === 'current' ? ' tcba-search-options__chip--active' : ''}`}>
              <button type="button" role="tab" aria-selected={source === 'current'} onClick={() => setSource('current')}>
                Текущие данные
              </button>
              <button
                className="tcba-search-options__action"
                type="button"
                aria-label={loading ? 'Остановить загрузку текущих данных' : 'Обновить текущие данные'}
                title={loading ? 'Остановить' : 'Обновить'}
                disabled={source !== 'current'}
                onClick={loading ? onStop : onRefresh}
              >
                {loading ? <StopIcon /> : <SearchOptionsRefreshIcon />}
              </button>
            </div>
            <div className={`tcba-search-options__chip${source === 'history' ? ' tcba-search-options__chip--active' : ''}`}>
              <button type="button" role="tab" aria-selected={source === 'history'} onClick={() => setSource('history')}>
                История поиска
              </button>
              <button
                className="tcba-search-options__action"
                type="button"
                aria-label="Очистить историю поиска"
                title="Очистить историю"
                disabled={source !== 'history'}
                onClick={() => {
                  onClearHistory(mode)
                  setSource('current')
                }}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
          <ul
            ref={listRef}
            className="tcba-search-options__list tcba-scroll-viewport"
            role="listbox"
            aria-label={source === 'current' ? 'Текущие данные поиска' : 'История поисковых запросов'}
          >
            {visibleItems.map((item) => (
              <li
                className="tcba-field-option"
                role="option"
                aria-selected={item === query}
                tabIndex={0}
                key={item}
                onClick={() => selectItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectItem(item)
                  }
                }}
              >
                <span className="tcba-field-option__label">{item}</span>
              </li>
            ))}
            {source === 'current' && loading && (
              <li className="tcba-search-options__loader" aria-label="Загрузка текущих данных">
                <img src={waitingLoaderUrl} alt="" />
              </li>
            )}
            {visibleItems.length === 0 && !(source === 'current' && loading) && (
              <li
                className={`tcba-search-options__empty${currentOptionsStatus === 'error' ? ' tcba-search-options__empty--error' : ''}`}
                role="status"
              >
                {emptyMessage}
              </li>
            )}
          </ul>
          <OverlayScrollbar
            className="tcba-search-options__scrollbar"
            metrics={scrollbar}
            thumbWidth={8}
          />
        </div>
      )}
    </div>
  )
}
