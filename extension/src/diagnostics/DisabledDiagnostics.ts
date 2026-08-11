import type { TeamCityService } from '../teamcity/TeamCityService'

export const diagnosticStyles = ''

export class DiagnosticRuntime {
  public readonly enabled = false
  public readonly store = undefined
  public readonly transportObserver = undefined

  public decorateService(service: TeamCityService): TeamCityService {
    return service
  }

  public attachUi(): void {}
}

export function DiagnosticConsole(): null {
  return null
}
