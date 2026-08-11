import type { TeamCityTransportObserver } from '../teamcity/TeamCityTransport'
import type { TeamCityService } from '../teamcity/TeamCityService'
import {
  DiagnosticEventStore,
  diagnosticConsoleEnabled,
} from './DiagnosticEventStore'
import { DiagnosticTeamCityService } from './DiagnosticTeamCityService'
import { DiagnosticTransportObserver } from './DiagnosticTransportObserver'
import { DiagnosticUiObserver } from './DiagnosticUiObserver'

export class DiagnosticRuntime {
  public readonly store: DiagnosticEventStore
  public readonly transportObserver?: TeamCityTransportObserver
  private readonly uiObserver?: DiagnosticUiObserver

  public constructor(public readonly enabled: boolean = diagnosticConsoleEnabled) {
    this.store = new DiagnosticEventStore(enabled)
    this.transportObserver = enabled ? new DiagnosticTransportObserver(this.store) : undefined
    this.uiObserver = enabled ? new DiagnosticUiObserver(this.store) : undefined
  }

  public decorateService(service: TeamCityService): TeamCityService {
    return this.enabled ? new DiagnosticTeamCityService(service, this.store) : service
  }

  public attachUi(root: ShadowRoot): void {
    this.uiObserver?.attach(root)
  }
}
