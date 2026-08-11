import { describe, expect, it, vi } from 'vitest'
import type { TeamCityService } from '../teamcity/TeamCityService'
import { DiagnosticRuntime } from './DiagnosticRuntime'

function serviceStub(): TeamCityService {
  return {
    loadCatalog: vi.fn(),
    loadBuilds: vi.fn(),
    resolveArtifact: vi.fn(),
  }
}

describe('DiagnosticRuntime', () => {
  it('becomes a no-op integration when disabled', () => {
    const service = serviceStub()
    const runtime = new DiagnosticRuntime(false)

    expect(runtime.enabled).toBe(false)
    expect(runtime.transportObserver).toBeUndefined()
    expect(runtime.decorateService(service)).toBe(service)
  })

  it('adds isolated decorators when enabled', () => {
    const service = serviceStub()
    const runtime = new DiagnosticRuntime(true)

    expect(runtime.transportObserver).toBeDefined()
    expect(runtime.decorateService(service)).not.toBe(service)
  })
})
