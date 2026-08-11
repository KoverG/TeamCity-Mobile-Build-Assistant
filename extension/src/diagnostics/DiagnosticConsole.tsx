import { useState, useSyncExternalStore } from 'react'
import { DiagnosticEventStore } from './DiagnosticEventStore'

interface DiagnosticConsoleProps {
  store: DiagnosticEventStore
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

export function DiagnosticConsole({ store }: DiagnosticConsoleProps) {
  const events = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [expandedEventIds, setExpandedEventIds] =
    useState<ReadonlySet<number>>(() => new Set())

  function toggleDetails(eventId: number, open: boolean) {
    setExpandedEventIds((current) => {
      const next = new Set(current)
      if (open) {
        next.add(eventId)
      } else {
        next.delete(eventId)
      }
      return next
    })
  }

  function openLogFile() {
    const blobUrl = URL.createObjectURL(new Blob([store.toJson()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
    store.emit('UI', 'success', 'Запрошено открытие временного log-файла в новой вкладке.')
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  function clearLog() {
    store.clear()
    setExpandedEventIds(new Set())
    store.emit('UI', 'info', 'Диагностический журнал очищен.')
  }

  return (
    <section className="tcba-debug" aria-label="Диагностическая консоль">
      <header className="tcba-debug__header">
        <div>
          <strong>Диагностика frontend</strong>
          <span>Локально в этой вкладке; без cookies и request headers</span>
        </div>
        <div className="tcba-debug__actions">
          <button className="tcba-debug__clear" type="button" onClick={openLogFile}>
            Открыть log-файл
          </button>
          <button className="tcba-debug__clear" type="button" onClick={clearLog}>
            Очистить
          </button>
        </div>
      </header>
      <div className="tcba-debug__log" role="log" aria-live="polite">
        {events.length === 0 && (
          <p className="tcba-debug__empty">Действия появятся здесь.</p>
        )}
        {events.map((event) => (
          <div className={`tcba-debug__event tcba-debug__event--${event.level}`} key={event.id}>
            <time>{formatTime(event.timestamp)}</time>
            <b>{event.source}</b>
            <div className="tcba-debug__message">
              <span>{event.message}</span>
              {event.details && (
                <details onToggle={(toggleEvent) =>
                  toggleDetails(event.id, toggleEvent.currentTarget.open)}>
                  <summary>
                    {event.details.kind === 'request'
                      ? 'Полный API URL'
                      : 'Полный API URL и response'}
                  </summary>
                  {expandedEventIds.has(event.id) && (
                    <div className="tcba-debug__details">
                      <a href={event.details.url} target="_blank" rel="noreferrer">
                        Открыть API GET в новой вкладке
                      </a>
                      <code>{event.details.url}</code>
                      {event.details.kind === 'response' && (
                        <>
                          <small>
                            HTTP {event.details.status} ·{' '}
                            {event.details.contentType || 'content-type отсутствует'}
                          </small>
                          <pre>{event.details.bodyText || '(empty response body)'}</pre>
                        </>
                      )}
                    </div>
                  )}
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
