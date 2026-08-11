import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SelectionStorage } from '../storage/SelectionStorage'
import type { TeamCityService } from '../teamcity/TeamCityService'
import { TeamCityError } from '../teamcity/TeamCityError'
import { App } from './App'

afterEach(() => {
  cleanup()
})

function createService(): TeamCityService {
  return {
    loadCatalog: vi.fn().mockResolvedValue({
      configurations: [
        {
          id: 'Synthetic_Mobile_android_stage',
          name: 'Android Stage',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile',
          paused: false,
        },
        {
          id: 'Synthetic_Mobile_ios_prod',
          name: 'iOS Production',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile',
          paused: false,
        },
        {
          id: 'Synthetic_Custom_Pipeline',
          name: 'Custom pipeline',
          projectId: 'Synthetic_Custom',
          projectName: 'Synthetic Custom',
          paused: false,
        },
      ],
      transport: 'main-world',
    }),
    loadBuilds: vi.fn(async (buildTypeIds: readonly string[]) => ({
      builds: [
        {
          id: '12345',
          buildTypeId: buildTypeIds[0] ?? 'Synthetic_Fallback',
          number: '42',
          branchName: 'feature/synthetic',
          defaultBranch: false,
          finishDate: '20260811T101500+0000',
        },
      ],
      transport: 'main-world' as const,
    })),
    resolveArtifact: vi.fn().mockResolvedValue({
      status: 'Resolved',
      candidates: [
        {
          name: 'synthetic-mobile.ipa',
          fullName: 'artifacts/synthetic-mobile.ipa',
          contentHref: '/repository/download/synthetic/mobile.ipa',
        },
      ],
      transport: 'main-world',
      diagnostics: {
        strategy: 'bulk',
        requestCount: 1,
        visitedNodes: 1,
        bulkExpandedArchives: false,
      },
    }),
  }
}

function createStorage(): SelectionStorage & {
  save: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
} {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  }
}

describe('App', () => {
  it('uses the Project → OS → Environment → Build cascade and resolves an artifact', async () => {
    const service = createService()
    render(
      <App
        service={service}
        selectionStorage={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    await screen.findByRole('combobox', { name: 'Project' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
      target: { value: 'Synthetic_Mobile' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'OS' }), { target: { value: 'iOS' } })
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveValue('Production')

    fireEvent.click(screen.getByRole('button', { name: 'Показать успешные сборки' }))
    await screen.findByText(/#42 · feature\/synthetic/)
    expect(service.loadBuilds).toHaveBeenCalledWith(['Synthetic_Mobile_ios_prod'])

    fireEvent.click(screen.getByRole('button', { name: 'Найти mobile artifact' }))
    await screen.findByText('Mobile artifact найден')
    expect(screen.getByText('artifacts/synthetic-mobile.ipa')).toBeInTheDocument()
    expect(screen.queryByText('TeamCity diagnostic spike')).not.toBeInTheDocument()
    expect(screen.queryByText(/Transport:/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть панель' }))
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: 'Project' })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    await waitFor(() => {
      expect(service.loadCatalog).toHaveBeenCalledTimes(2)
    })
  })

  it('retries the failed artifact operation', async () => {
    const service = createService()
    vi.mocked(service.resolveArtifact)
      .mockRejectedValueOnce(new TeamCityError('RequestTimeout', 'Synthetic timeout.'))
      .mockResolvedValueOnce({
        status: 'Resolved',
        candidates: [
          {
            name: 'synthetic-mobile.ipa',
            fullName: 'artifacts/synthetic-mobile.ipa',
            contentHref: '/repository/download/synthetic/mobile.ipa',
          },
        ],
        transport: 'service-worker',
        diagnostics: {
          strategy: 'bulk',
          requestCount: 1,
          visitedNodes: 1,
          bulkExpandedArchives: false,
        },
      })
    render(
      <App
        service={service}
        selectionStorage={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    await screen.findByRole('combobox', { name: 'Project' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
      target: { value: 'Synthetic_Mobile' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'OS' }), { target: { value: 'iOS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Показать успешные сборки' }))
    await screen.findByRole('combobox', { name: 'Build' })

    fireEvent.click(screen.getByRole('button', { name: 'Найти mobile artifact' }))
    await screen.findByText('TeamCity отвечает слишком долго. Повторите поиск.')

    fireEvent.click(screen.getByRole('button', { name: 'Повторить запрос' }))
    await screen.findByText('Mobile artifact найден')

    expect(service.resolveArtifact).toHaveBeenCalledTimes(2)
    expect(service.loadCatalog).toHaveBeenCalledTimes(1)
  })

  it('keeps an unknown configuration visible and persists an explicit selection', async () => {
    const storage = createStorage()
    const service = createService()
    render(
      <App
        service={service}
        selectionStorage={storage}
        origin="https://teamcity.example.test"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    await screen.findByRole('combobox', { name: 'Project' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
      target: { value: 'Synthetic_Custom' },
    })

    expect(screen.getByRole('combobox', { name: 'OS' })).toHaveValue('Unclassified')
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveValue('Unclassified')
    fireEvent.click(screen.getByRole('checkbox', { name: /Запомнить выбранные значения/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Показать успешные сборки' }))
    await screen.findByRole('combobox', { name: 'Build' })
    expect(screen.getByRole('combobox', { name: 'Тип mobile artifact' })).toHaveValue('android')

    fireEvent.click(screen.getByRole('button', { name: 'Найти mobile artifact' }))
    await screen.findByText('Mobile artifact найден')
    expect(service.resolveArtifact).toHaveBeenCalledWith(
      '12345',
      'Synthetic_Custom_Pipeline',
      'android',
    )

    await waitFor(() => {
      expect(storage.save).toHaveBeenCalledWith('https://teamcity.example.test', {
        projectId: 'Synthetic_Custom',
        os: 'Unclassified',
        environment: 'Unclassified',
      })
    })
  })
})
