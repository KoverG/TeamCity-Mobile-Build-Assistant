import type { TeamCityService } from '../teamcity/TeamCityService'
import type { MobilePlatform } from '../teamcity/ArtifactResolver'
import { TeamCityError } from '../teamcity/TeamCityError'
import { DiagnosticEventStore } from './DiagnosticEventStore'

function errorCode(error: unknown): string {
  return error instanceof TeamCityError ? error.code : 'RuntimeError'
}

export class DiagnosticTeamCityService implements TeamCityService {
  public constructor(
    private readonly inner: TeamCityService,
    private readonly store: DiagnosticEventStore,
  ) {}

  public async loadCatalog() {
    this.store.emit('UI', 'info', 'Загрузка каталога запущена.')
    try {
      const result = await this.inner.loadCatalog()
      this.store.emit(
        'UI',
        'success',
        `Каталог загружен: ${result.configurations.length} configurations.`,
      )
      return result
    } catch (error) {
      this.store.emit('UI', 'error', `Каталог: ${errorCode(error)}.`)
      throw error
    }
  }

  public async loadBuilds(buildTypeIds: readonly string[]) {
    this.store.emit(
      'UI',
      'info',
      `Загрузка успешных builds: ${buildTypeIds.length} configurations.`,
    )
    try {
      const result = await this.inner.loadBuilds(buildTypeIds)
      this.store.emit('UI', 'success', `Получено builds: ${result.builds.length}.`)
      return result
    } catch (error) {
      this.store.emit('UI', 'error', `Builds: ${errorCode(error)}.`)
      throw error
    }
  }

  public async resolveArtifact(
    buildId: string,
    buildTypeId: string,
    platform: MobilePlatform,
  ) {
    this.store.emit(
      'UI',
      'info',
      `Поиск mobile artifact: ${platform === 'android' ? 'APK' : 'IPA'}.`,
    )
    try {
      const result = await this.inner.resolveArtifact(buildId, buildTypeId, platform)
      this.store.emit(
        'UI',
        result.status === 'Resolved' ? 'success' : 'warning',
        `Поиск завершён: ${result.status}, candidates: ${result.candidates.length}, strategy: ${result.diagnostics.strategy}, requests: ${result.diagnostics.requestCount}, nodes: ${result.diagnostics.visitedNodes}.`,
      )
      return result
    } catch (error) {
      this.store.emit('UI', 'error', `Artifact search: ${errorCode(error)}.`)
      throw error
    }
  }
}
