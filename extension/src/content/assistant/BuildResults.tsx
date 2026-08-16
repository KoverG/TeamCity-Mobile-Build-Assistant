import { useRef } from 'react'
import type { BuildArtifactMatch } from '../../teamcity/BuildArtifactSearch'
import {
  AndroidIcon,
  AppleIcon,
  CopyIcon,
  DownloadIcon,
  RefreshIcon,
  SearchIcon,
  TelegramIcon,
} from './Icons'
import { IconButton } from './IconButton'
import { OverlayScrollbar } from './ScrollArea'
import { useScrollMetrics } from './useScrollMetrics'

interface BuildResultsProps {
  matches: readonly BuildArtifactMatch[]
  selectedBuildIds: ReadonlySet<string>
  onRefresh(): void
  onToggle(buildId: string): void
  onCopy(matches: readonly BuildArtifactMatch[]): void
  onDownload(match: BuildArtifactMatch): void
  onOpenBuild(match: BuildArtifactMatch): void
}

function resultLabel(count: number): string {
  const modulo100 = count % 100
  const modulo10 = count % 10
  const noun = modulo100 >= 11 && modulo100 <= 14
    ? 'билдов'
    : modulo10 === 1
      ? 'билд'
      : modulo10 >= 2 && modulo10 <= 4
        ? 'билда'
        : 'билдов'
  return `Сборки: ${count} ${noun}`
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
  onToggle,
  onCopy,
  onDownload,
  onOpenBuild,
}: {
  match: BuildArtifactMatch
  selected: boolean
  onToggle(): void
  onCopy(): void
  onDownload(): void
  onOpenBuild(): void
}) {
  return (
    <article
      className={`tcba-build-card${selected ? ' tcba-build-card--selected' : ''}`}
    >
      <button
        className="tcba-build-card__select"
        type="button"
        aria-label={`${selected ? 'Исключить' : 'Выбрать'} сборку #${match.build.number}`}
        aria-pressed={selected}
        onClick={onToggle}
      />
      <span className="tcba-build-card__platform" aria-hidden="true">
        {match.configuration.platform === 'android'
          ? <AndroidIcon />
          : <AppleIcon />}
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
      <span className="tcba-build-card__actions">
        <span>
          <IconButton
            label={`Скопировать ссылку на сборку #${match.build.number}`}
            tone="primary"
            onClick={onCopy}
          >
            <CopyIcon />
          </IconButton>
          <IconButton
            label={`Скачать сборку #${match.build.number}`}
            tone="primary"
            onClick={onDownload}
          >
            <DownloadIcon />
          </IconButton>
        </span>
        <small>{formatSize(match.artifact.size)}</small>
      </span>
    </article>
  )
}

export function BuildResults({
  matches,
  selectedBuildIds,
  onRefresh,
  onToggle,
  onCopy,
  onDownload,
  onOpenBuild,
}: BuildResultsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const scroll = useScrollMetrics(listRef, matches)
  const selectedMatches = matches.filter((match) => selectedBuildIds.has(match.build.id))

  return (
    <section className="tcba-results" aria-label="Найденные сборки">
      <header className="tcba-results__header">
        <span>{resultLabel(matches.length)}</span>
        <IconButton
          className="tcba-icon-button--refresh"
          label="Повторить поиск сборок"
          tone="primary"
          onClick={onRefresh}
        >
          <RefreshIcon />
        </IconButton>
        <IconButton label="Поиск в результатах — скоро" tone="primary" decorative>
          <SearchIcon />
        </IconButton>
      </header>

      <div className="tcba-results__viewport">
        <div
          className={`tcba-results__fade tcba-results__fade--top${scroll.overflowStart ? ' tcba-results__fade--visible' : ''}`}
          aria-hidden="true"
        />
        <div className="tcba-results__list tcba-scroll-viewport" ref={listRef}>
          {matches.map((match) => (
            <BuildCard
              key={match.build.id}
              match={match}
              selected={selectedBuildIds.has(match.build.id)}
              onToggle={() => onToggle(match.build.id)}
              onCopy={() => onCopy([match])}
              onDownload={() => onDownload(match)}
              onOpenBuild={() => onOpenBuild(match)}
            />
          ))}
          {matches.length === 0 && (
            <p className="tcba-results__empty">Сборки с одним mobile artifact не найдены.</p>
          )}
        </div>
        <OverlayScrollbar
          className="tcba-results__scrollbar"
          metrics={scroll}
          thumbWidth={7}
        />
        <div
          className={`tcba-results__fade tcba-results__fade--bottom${scroll.overflowEnd ? ' tcba-results__fade--visible' : ''}`}
          aria-hidden="true"
        />
      </div>

      <footer className="tcba-results__footer">
        <button
          className="tcba-action-button tcba-action-button--secondary"
          type="button"
          disabled={matches.length === 0}
          onClick={() => onCopy(selectedMatches.length > 0 ? selectedMatches : matches)}
        >
          {selectedMatches.length > 0 ? 'Копировать выбранное' : 'Копировать все'}
        </button>
        <button className="tcba-action-button" type="button" aria-disabled="true" tabIndex={-1}>
          <TelegramIcon />
          Отправить в ТГ
        </button>
      </footer>
    </section>
  )
}
