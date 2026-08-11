export type DiagnosticLevel = 'info' | 'success' | 'warning' | 'error'

export type DiagnosticDetails =
  | { kind: 'request'; url: string }
  | {
      kind: 'response'
      url: string
      status: number
      contentType: string
      bodyText: string
    }

export interface DiagnosticEvent {
  id: number
  timestamp: number
  level: DiagnosticLevel
  source: 'UI' | 'TeamCity'
  message: string
  details?: DiagnosticDetails
}

const maximumEvents = 200
const maximumRetainedCharacters = 12_000_000

export const diagnosticConsoleEnabled =
  import.meta.env.DEV || import.meta.env.VITE_TCBA_DEBUG_PANEL === 'true'

export class DiagnosticEventStore {
  private nextId = 1
  private snapshot: readonly DiagnosticEvent[] = []
  private readonly listeners = new Set<() => void>()

  public constructor(public readonly enabled: boolean) {}

  public readonly getSnapshot = (): readonly DiagnosticEvent[] => this.snapshot

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public emit(
    source: DiagnosticEvent['source'],
    level: DiagnosticLevel,
    message: string,
    details?: DiagnosticDetails,
  ): void {
    if (!this.enabled) {
      return
    }

    const nextEvents = [
      ...this.snapshot,
      { id: this.nextId, timestamp: Date.now(), level, source, message, details },
    ].slice(-maximumEvents)
    let retainedCharacters = 0
    this.snapshot = [...nextEvents]
      .reverse()
      .filter((event) => {
        retainedCharacters +=
          event.message.length +
          (event.details?.kind === 'response' ? event.details.bodyText.length : 0)
        return retainedCharacters <= maximumRetainedCharacters
      })
      .reverse()
    this.nextId += 1
    this.publish()
  }

  public clear(): void {
    this.snapshot = []
    this.publish()
  }

  public toJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        warning: 'Local diagnostic data. May contain runtime TeamCity URLs and response bodies.',
        events: this.snapshot.map((event) => ({
          ...event,
          timestamp: new Date(event.timestamp).toISOString(),
        })),
      },
      null,
      2,
    )
  }

  private publish(): void {
    this.listeners.forEach((listener) => listener())
  }
}
