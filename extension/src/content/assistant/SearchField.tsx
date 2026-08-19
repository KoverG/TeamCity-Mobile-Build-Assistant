import { useEffect, useRef, useState } from 'react'
import type { BuildSearchMode } from '../../teamcity/BuildSearch'
import type { SearchHistory } from '../../storage/SearchHistoryStorage'
import {
  BuildNumberSearchIcon,
  CloseIcon,
  SearchIcon,
  TaskBranchSearchIcon,
} from './Icons'
import { eventPathContains } from './eventPath'

interface SearchFieldProps {
  mode: BuildSearchMode
  queries: Record<BuildSearchMode, string>
  history: SearchHistory
  disabled: boolean
  onModeChange(mode: BuildSearchMode): void
  onQueryChange(mode: BuildSearchMode, query: string): void
  onClearHistory(mode: BuildSearchMode): void
  onSearch(): void
}

const modeLabels: Record<BuildSearchMode, string> = {
  task: 'Поиск по номеру задачи',
  build: 'Поиск по номеру билда',
}

export function SearchField({
  mode,
  queries,
  history,
  disabled,
  onModeChange,
  onQueryChange,
  onClearHistory,
  onSearch,
}: SearchFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const activeHistory = history[mode]
  const query = queries[mode]

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current
      if (root !== null && !eventPathContains(event, root)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  function selectMode(nextMode: BuildSearchMode) {
    const resolvedMode = nextMode === mode
      ? (mode === 'task' ? 'build' : 'task')
      : nextMode
    onModeChange(resolvedMode)
    setHistoryOpen(false)
  }

  function selectHistoryItem(item: string) {
    onQueryChange(mode, item)
    setHistoryOpen(false)
  }

  return (
    <div className={`tcba-search-field${historyOpen && activeHistory.length > 0 ? ' tcba-search-field--open' : ''}`} ref={rootRef}>
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
      <div className="tcba-search-field__control">
        <SearchIcon className="tcba-search-field__search-icon" />
        <input
          type="text"
          value={query}
          maxLength={128}
          disabled={disabled}
          aria-label={modeLabels[mode]}
          placeholder={mode === 'task' ? 'Поиск по ветке задачи...' : 'Поиск по номеру билда...'}
          onChange={(event) => onQueryChange(mode, event.currentTarget.value)}
          onFocus={() => setHistoryOpen(activeHistory.length > 0)}
          onClick={() => setHistoryOpen(activeHistory.length > 0)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              setHistoryOpen(false)
              onSearch()
            } else if (event.key === 'Escape') {
              setHistoryOpen(false)
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
      {historyOpen && activeHistory.length > 0 && (
        <div className="tcba-field-dropdown tcba-search-field__history">
          <div className="tcba-search-field__history-actions">
            <button
              className="tcba-search-field__clear-history"
              type="button"
              onClick={() => {
                onClearHistory(mode)
                setHistoryOpen(false)
              }}
            >
              Очистить
            </button>
          </div>
          <ul className="tcba-search-field__history-list" role="listbox" aria-label="История поисковых запросов">
            {activeHistory.map((item) => (
              <li
                className="tcba-field-option"
                role="option"
                aria-selected={item === query}
                tabIndex={0}
                key={item}
                onClick={() => selectHistoryItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectHistoryItem(item)
                  }
                }}
              >
                <span className="tcba-field-option__label">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
