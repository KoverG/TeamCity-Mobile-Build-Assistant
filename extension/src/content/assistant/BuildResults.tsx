import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { contentAssetUrl } from '../assetUrl'
import { AdditionalActionSlot } from '../additional-actions/AdditionalActionSlot'
import { useAdditionalActionsAt } from '../additional-actions/useAdditionalActionsAt'
import type { BuildArtifactMatch } from '../../teamcity/BuildArtifactSearch'
import helloMascotAsset from './assets/Main_Hello.png'
import waitingMascotAsset from './assets/Main_Waiting.png'
import notFoundMascotAsset from './assets/Main_Not_Found.png'
import waitingShadowAsset from './assets/Ellipse Shadow.svg'
import waitingLoaderAsset from './assets/blocks-shuffle-4.svg'
import {
  AndroidIcon,
  AppleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ResultsGhostIcon,
  SortBuildsIcon,
} from './Icons'
import { IconButton } from './IconButton'
import { OverlayScrollbar } from './ScrollArea'
import { useScrollMetrics } from './useScrollMetrics'
import { findEventPathElement } from './eventPath'

const helloMascotUrl = contentAssetUrl(helloMascotAsset)
const waitingMascotUrl = contentAssetUrl(waitingMascotAsset)
const notFoundMascotUrl = contentAssetUrl(notFoundMascotAsset)
const waitingShadowUrl = contentAssetUrl(waitingShadowAsset)
const waitingLoaderUrl = contentAssetUrl(waitingLoaderAsset)

export interface AssistantToast {
  message: string
  tone: 'success' | 'error'
}

interface BuildResultsProps {
  status: 'idle' | 'loading' | 'ready' | 'error'
  hasSearched: boolean
  errorMessage?: string
  matches: readonly BuildArtifactMatch[]
  selectedBuildIds: ReadonlySet<string>
  toast?: AssistantToast
  onRetry(): void
  onToggle(buildId: string): void
  onCopy(matches: readonly BuildArtifactMatch[]): void
  onDownload(match: BuildArtifactMatch): void
  onOpenBuild(match: BuildArtifactMatch): void
}

function formatFinishDate(value: string | undefined): string {
  if (value === undefined) {
    return '—'
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(value)
  return match === null
    ? value
    : `${match[3]}.${match[2]}.${match[1].slice(2)}  ${match[4]}:${match[5]}`
}

function formatSize(size: number | undefined): string {
  return size === undefined ? '—' : `${(size / 1024 / 1024).toFixed(2)} MB`
}

function BuildCard({
  match,
  selected,
  revealed,
  onReveal,
  onClose,
  onToggle,
  onCopy,
  onDownload,
  onOpenBuild,
}: {
  match: BuildArtifactMatch
  selected: boolean
  revealed: boolean
  onReveal(): void
  onClose(): void
  onToggle(): void
  onCopy(): void
  onDownload(): void
  onOpenBuild(): void
}) {
  function revealFromContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (revealed) {
      onClose()
    } else {
      onReveal()
    }
  }

  function handleContextKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      if (revealed) {
        onClose()
      } else {
        onReveal()
      }
    } else if (event.key === 'Escape' && revealed) {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className={`tcba-build-row${revealed ? ' tcba-build-row--revealed' : ''}`}
      data-build-id={match.build.id}
    >
      <div className="tcba-build-row__download" aria-hidden={!revealed}>
        <IconButton
          label={`Скачать сборку #${match.build.number}`}
          tone="primary"
          tabIndex={revealed ? 0 : -1}
          onClick={onDownload}
        >
          <DownloadIcon />
        </IconButton>
        <small>{formatSize(match.artifact.size)}</small>
      </div>
      <article
        className={`tcba-build-card${selected ? ' tcba-build-card--selected' : ''}`}
        onContextMenu={revealFromContextMenu}
      >
        <button
          className="tcba-build-card__select"
          type="button"
          aria-label={`${selected ? 'Исключить' : 'Выбрать'} сборку #${match.build.number}`}
          aria-pressed={selected}
          onClick={onToggle}
          onKeyDown={handleContextKey}
        />
        <span className="tcba-build-card__platform" aria-hidden="true">
          {match.configuration.platform === 'android' ? <AndroidIcon /> : <AppleIcon />}
          <small>{match.configuration.platform === 'android' ? 'apk' : 'ipa'}</small>
        </span>
        <span className="tcba-build-card__content">
          <strong>{match.configuration.name}</strong>
          <span>
            <button
              className="tcba-build-card__number"
              type="button"
              aria-label={`Открыть билд #${match.build.number} в TeamCity`}
              onClick={onOpenBuild}
            >
              #{match.build.number}
            </button>
            {' | '}
            {match.build.branchName ?? (match.build.defaultBranch ? 'default branch' : 'branch —')}
          </span>
          <time dateTime={match.build.finishDate}>{formatFinishDate(match.build.finishDate)}</time>
        </span>
        <span className="tcba-build-card__copy">
          <IconButton label={`Скопировать ссылку на сборку #${match.build.number}`} tone="primary" onClick={onCopy}>
            <CopyIcon />
          </IconButton>
        </span>
      </article>
    </div>
  )
}

function MascotState({ type }: { type: 'hello' | 'waiting' | 'not-found' }) {
  if (type === 'waiting') {
    return (
      <div className="tcba-results-state tcba-results-state--waiting" role="status">
        <div className="tcba-results-state__visual tcba-results-state__waiting-visual">
          <img className="tcba-results-state__mascot" src={waitingMascotUrl} alt="Маскот ищет сборки" />
          <img className="tcba-results-state__shadow" src={waitingShadowUrl} alt="" />
        </div>
        <strong>Ищем сборки...</strong>
        <span>Пожалуйста подождите</span>
        <img className="tcba-results-state__loader" src={waitingLoaderUrl} alt="" />
      </div>
    )
  }
  const notFound = type === 'not-found'
  return (
    <div className={`tcba-results-state tcba-results-state--${type}`}>
      <div className="tcba-results-state__visual">
        <img
          className="tcba-results-state__mascot"
          src={notFound ? notFoundMascotUrl : helloMascotUrl}
          alt=""
        />
      </div>
      <strong>{notFound ? 'Не удалось найти сборки' : 'Здесь пока ничего нет'}</strong>
      <span>
        {notFound
          ? <>Мы ничего не нашли по вашему запросу.<br />Измените параметры и попробуйте снова</>
          : <>Выберите параметры слева<br />и найдем для вас сборки</>}
      </span>
    </div>
  )
}

export function BuildResults({
  status,
  hasSearched,
  errorMessage,
  matches,
  selectedBuildIds,
  toast,
  onRetry,
  onToggle,
  onCopy,
  onDownload,
  onOpenBuild,
}: BuildResultsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [revealedBuildId, setRevealedBuildId] = useState<string>()
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const sortedMatches = useMemo(() => [...matches].sort((left, right) => {
    const comparison = (left.build.finishDate ?? '').localeCompare(right.build.finishDate ?? '')
    return sortOrder === 'newest' ? -comparison : comparison
  }), [matches, sortOrder])
  const scroll = useScrollMetrics(listRef, sortedMatches, 28)
  const selectedMatches = sortedMatches.filter((match) => selectedBuildIds.has(match.build.id))
  const { actions: resultActions } = useAdditionalActionsAt('build-results')
  const actionContext = useMemo(() => ({
    type: 'build-selection' as const,
    builds: selectedMatches.map((match) => ({
      buildId: match.build.id,
      buildNumber: match.build.number,
      artifactName: match.artifact.name,
      artifactHref: match.artifact.contentHref,
      platform: match.configuration.platform,
    })),
  }), [selectedMatches])

  useEffect(() => {
    if (revealedBuildId === undefined) {
      return
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const row = findEventPathElement(event, 'tcba-build-row')
      if (row?.getAttribute('data-build-id') !== revealedBuildId) {
        setRevealedBuildId(undefined)
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setRevealedBuildId(undefined)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [revealedBuildId])

  const showCards = status === 'ready' && matches.length > 0
  const headerText = status === 'loading'
      ? 'Поиск...'
      : status === 'error'
        ? 'Ошибка поиска'
        : 'Сборки не найдены'

  return (
    <section className={`tcba-results${showCards ? ' tcba-results--with-cards' : ''}`} aria-label="Результаты поиска сборок">
      {toast !== undefined && (
        <div className={`tcba-toast tcba-toast--${toast.tone}`} role="status">
          {toast.tone === 'success' && <CheckIcon />}
          <span>{toast.message}</span>
        </div>
      )}
      <header className={`tcba-results__header${showCards ? ' tcba-results__header--with-results' : ''}`}>
        <ResultsGhostIcon />
        {showCards ? (
          <span className="tcba-results__count">
            <strong>Найдены сборки:</strong>
            {' '}
            <b>{matches.length}</b>
          </span>
        ) : (
          <span>{headerText}</span>
        )}
        {showCards && (
          <IconButton
            label={sortOrder === 'newest' ? 'Показать сначала старые сборки' : 'Показать сначала новые сборки'}
            title={sortOrder === 'newest' ? 'Сначала новые' : 'Сначала старые'}
            tone="primary"
            onClick={() => setSortOrder((current) => current === 'newest' ? 'oldest' : 'newest')}
          >
            <SortBuildsIcon className={sortOrder === 'oldest' ? 'tcba-sort-icon--oldest' : undefined} />
          </IconButton>
        )}
      </header>

      {status === 'error' ? (
        <div className="tcba-results-error" role="alert">
          <strong>Не удалось выполнить поиск</strong>
          <span>{errorMessage}</span>
          <button type="button" onClick={onRetry}>Повторить</button>
        </div>
      ) : status === 'loading' ? (
        <MascotState type="waiting" />
      ) : !hasSearched ? (
        <MascotState type="hello" />
      ) : !showCards ? (
        <MascotState type="not-found" />
      ) : (
        <>
          <div className="tcba-results__viewport">
            <div className={`tcba-results__fade tcba-results__fade--top${scroll.overflowStart ? ' tcba-results__fade--visible' : ''}`} aria-hidden="true" />
            <div
              className="tcba-results__list tcba-scroll-viewport"
              ref={listRef}
              onScroll={() => setRevealedBuildId(undefined)}
            >
              {sortedMatches.map((match) => (
                <BuildCard
                  key={match.build.id}
                  match={match}
                  selected={selectedBuildIds.has(match.build.id)}
                  revealed={revealedBuildId === match.build.id}
                  onReveal={() => setRevealedBuildId(match.build.id)}
                  onClose={() => setRevealedBuildId(undefined)}
                  onToggle={() => onToggle(match.build.id)}
                  onCopy={() => onCopy([match])}
                  onDownload={() => {
                    setRevealedBuildId(undefined)
                    onDownload(match)
                  }}
                  onOpenBuild={() => onOpenBuild(match)}
                />
              ))}
            </div>
            <OverlayScrollbar className="tcba-results__scrollbar" metrics={scroll} thumbWidth={7} />
            <div className={`tcba-results__fade tcba-results__fade--bottom${scroll.overflowEnd ? ' tcba-results__fade--visible' : ''}`} aria-hidden="true" />
          </div>

          <footer
            className="tcba-results__footer"
            style={{ '--tcba-results-action-count': resultActions.length + 1 } as CSSProperties}
          >
            <button
              className="tcba-action-button tcba-action-button--secondary"
              type="button"
              onClick={() => onCopy(selectedMatches.length > 0 ? selectedMatches : sortedMatches)}
            >
              {selectedMatches.length > 0 ? 'Копировать' : 'Копировать все'}
            </button>
            <AdditionalActionSlot
              placement="build-results"
              context={actionContext}
              appearance="button"
              disabled={selectedMatches.length === 0}
            />
          </footer>
        </>
      )}
    </section>
  )
}
