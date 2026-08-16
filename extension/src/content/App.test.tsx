import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SelectionStorage } from '../storage/SelectionStorage'
import type { TeamCityService } from '../teamcity/TeamCityService'
import { TeamCityError } from '../teamcity/TeamCityError'
import { App } from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function createService(): TeamCityService {
  return {
    loadCatalog: vi.fn().mockResolvedValue({
      configurations: [
        {
          id: 'Synthetic_Mobile_android_stage',
          name: 'Android Stage',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile / client / app',
          paused: false,
        },
        {
          id: 'Synthetic_Mobile_ios_prod',
          name: 'iOS Production',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile / client / app',
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
          size: 136_681_472,
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

function createStorage(remembered?: Awaited<ReturnType<SelectionStorage['load']>>): SelectionStorage & {
  save: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
} {
  return {
    load: vi.fn().mockResolvedValue(remembered),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  }
}

async function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
  await screen.findByRole('combobox', { name: 'Проект' })
}

function selectComboboxOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

describe('App', () => {
  it('replaces the results header with the loading search button while builds are searched', async () => {
    const service = createService()
    let finishLoading: ((value: Awaited<ReturnType<TeamCityService['loadBuilds']>>) => void) | undefined
    vi.mocked(service.loadBuilds).mockImplementation(() => new Promise((resolve) => {
      finishLoading = resolve
    }))
    render(
      <App
        service={service}
        selectionStorage={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))

    expect(await screen.findByRole('button', { name: 'Поиск сборок…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(/^Сборки:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Повторить поиск сборок' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Поиск в результатах — скоро' })).not.toBeInTheDocument()

    finishLoading?.({ builds: [], transport: 'main-world' })
    expect(await screen.findByText('Сборки: 0 билдов')).toBeInTheDocument()
  })

  it('searches the selected platform and renders only the resolved artifact card', async () => {
    const service = createService()
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    render(
      <App
        service={service}
        selectionStorage={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    expect(screen.queryByText('Synthetic Mobile / client / app')).not.toBeInTheDocument()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'iOS' }))
    selectComboboxOption('Окружение', 'Production')

    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('iOS Production')

    expect(service.loadBuilds).toHaveBeenCalledWith(
      ['Synthetic_Mobile_ios_prod'],
      expect.objectContaining({ maximumBuilds: 20 }),
    )
    expect(service.resolveArtifact).toHaveBeenCalledWith(
      '12345',
      'Synthetic_Mobile_ios_prod',
      'ios',
      expect.objectContaining({ requestTimeoutMs: 30_000 }),
    )
    expect(screen.getByText('130.35 MB')).toBeInTheDocument()
    expect(screen.getByText('Сборки: 1 билд')).toBeInTheDocument()
    expect(screen.queryByText('TeamCity diagnostic spike')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Открыть билд #42 в TeamCity' }))
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      type: 'teamcity:open-build',
      buildId: '12345',
    }))
    expect(screen.getByRole('button', { name: 'Выбрать сборку #42' }))
      .toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Обновить список проектов' }))
    await waitFor(() => expect(service.loadCatalog).toHaveBeenCalledTimes(2))
  })

  it('retries a failed artifact search as a complete build search', async () => {
    const service = createService()
    vi.mocked(service.resolveArtifact)
      .mockRejectedValueOnce(new TeamCityError('RequestTimeout', 'Synthetic timeout.'))
      .mockResolvedValueOnce({
        status: 'Resolved',
        candidates: [
          {
            name: 'synthetic-mobile.apk',
            fullName: 'artifacts/synthetic-mobile.apk',
            contentHref: '/repository/download/synthetic/mobile.apk',
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

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Android' }))
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('TeamCity отвечает слишком долго. Повторите поиск.')

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await screen.findByText('Android Stage')

    expect(service.loadBuilds).toHaveBeenCalledTimes(2)
    expect(service.resolveArtifact).toHaveBeenCalledTimes(2)
    expect(service.loadCatalog).toHaveBeenCalledTimes(1)
  })

  it('treats empty platform and environment as all and restores a remembered selection', async () => {
    const storage = createStorage({
      projectId: 'Synthetic_Mobile',
      os: 'Android',
      environment: 'Staging',
    })
    const service = createService()
    render(
      <App
        service={service}
        selectionStorage={storage}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    expect(screen.getByRole('combobox', { name: 'Проект' })).toHaveTextContent('Synthetic Mobile')
    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Окружение' })).toHaveTextContent('Staging')

    fireEvent.click(screen.getByRole('button', { name: 'Android' }))
    expect(screen.getByRole('combobox', { name: 'Окружение' })).toHaveTextContent('Выберите окружение')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('Android Stage')

    expect(service.loadBuilds).toHaveBeenCalledWith(
      ['Synthetic_Mobile_android_stage', 'Synthetic_Mobile_ios_prod'],
      expect.objectContaining({ maximumBuilds: 20 }),
    )
    expect(screen.queryByText('Synthetic Custom')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(storage.save).toHaveBeenCalledWith('https://teamcity.example.test', {
        projectId: 'Synthetic_Mobile',
        os: 'Unclassified',
        environment: 'Unclassified',
      })
    })
  })
})
