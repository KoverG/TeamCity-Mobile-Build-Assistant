import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LegacySelectionCleanup } from '../storage/LegacySelectionCleanup'
import type { SearchHistoryStorage } from '../storage/SearchHistoryStorage'
import type { TeamCityService } from '../teamcity/TeamCityService'
import { TeamCityError } from '../teamcity/TeamCityError'
import {
  createAdditionalActionsService,
  type AdditionalActionsGateway,
} from '../additional-actions/AdditionalActionsService'
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

function createStorage(): LegacySelectionCleanup & {
  clear: ReturnType<typeof vi.fn>
} {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
  }
}

async function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
  await screen.findByRole('combobox', { name: 'Проект' })
}

function createHistoryStorage(
  history = { task: [] as string[], build: [] as string[] },
): SearchHistoryStorage & { save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn().mockResolvedValue(history),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function selectComboboxOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

describe('App', () => {
  it('keeps the regular project placeholder while the catalog is loading', async () => {
    const service = createService()
    let finishLoading: ((value: Awaited<ReturnType<TeamCityService['loadCatalog']>>) => void) | undefined
    vi.mocked(service.loadCatalog).mockImplementation(() => new Promise((resolve) => {
      finishLoading = resolve
    }))
    render(
      <App
        service={service}
        legacySelectionCleanup={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    const projectCombobox = screen.getByRole('combobox', { name: 'Проект' })
    expect(projectCombobox).toBeDisabled()
    expect(projectCombobox).toHaveTextContent('Выберите проект')
    expect(screen.queryByText('Загрузка проектов…')).not.toBeInTheDocument()

    finishLoading?.({
      configurations: [
        {
          id: 'Synthetic_Mobile_android_stage',
          name: 'Android Stage',
          projectId: 'Synthetic_Mobile',
          projectName: 'Synthetic Mobile',
          paused: false,
        },
      ],
      transport: 'main-world',
    })
    await waitFor(() => expect(projectCombobox).not.toBeDisabled())
  })

  it('shows the result badge immediately and opens the hello state before the first search', async () => {
    render(
      <App
        service={createService()}
        legacySelectionCleanup={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    const resultBadge = screen.getByRole('button', { name: 'Показать результаты поиска' })
    expect(resultBadge).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(resultBadge)
    expect(screen.getByText('Здесь пока ничего нет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скрыть результаты поиска' }))
      .toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps separate drafts and histories for task and build-number modes', async () => {
    const service = createService()
    const historyStorage = createHistoryStorage({ task: ['TASK-123'], build: ['42'] })
    render(
      <App
        service={service}
        legacySelectionCleanup={createStorage()}
        searchHistoryStorage={historyStorage}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    const taskInput = screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })
    fireEvent.focus(taskInput)
    const historyOption = screen.getByRole('option', { name: /^TASK-123/ })
    expect(historyOption).toHaveClass('tcba-field-option')
    expect(historyOption.closest('[role="listbox"]')?.parentElement).toHaveClass('tcba-field-dropdown')
    expect(screen.getByRole('button', { name: 'Очистить' }).closest('[role="option"]')).toBeNull()
    expect(screen.queryByText('Недавние запросы')).not.toBeInTheDocument()
    fireEvent.click(historyOption)
    expect(service.loadBuilds).not.toHaveBeenCalled()

    const buildModeButton = screen.getByRole('button', { name: 'Искать по номеру билда' })
    expect(taskInput.closest('.tcba-search-field__control')).not.toContainElement(buildModeButton)
    fireEvent.focus(taskInput)
    expect(screen.getByRole('listbox', { name: 'История поисковых запросов' })).toBeInTheDocument()
    fireEvent.click(buildModeButton)
    expect(screen.queryByRole('listbox', { name: 'История поисковых запросов' })).not.toBeInTheDocument()
    const buildInput = screen.getByRole('textbox', { name: 'Поиск по номеру билда' })
    expect(buildInput).toHaveValue('')
    fireEvent.change(buildInput, { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Искать по номеру билда' }))
    expect(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })).toHaveValue('TASK-123')
    fireEvent.click(screen.getByRole('button', { name: 'Искать по номеру задачи в ветке' }))
    expect(screen.getByRole('textbox', { name: 'Поиск по номеру билда' })).toHaveValue('42')
    fireEvent.click(screen.getByRole('button', { name: 'Искать по номеру задачи в ветке' }))
    expect(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })).toHaveValue('TASK-123')

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }), { key: 'Enter' })
    await screen.findByText('Android Stage')
    expect(service.loadBuilds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ query: { mode: 'task', value: 'TASK-123' } }),
    )
    await waitFor(() => expect(historyStorage.save).toHaveBeenCalledWith(
      'https://teamcity.example.test',
      expect.objectContaining({ task: ['TASK-123'] }),
    ))
  })

  it('stops an active search and shows the empty-result state', async () => {
    const service = createService()
    let finishLoading: ((value: Awaited<ReturnType<TeamCityService['loadBuilds']>>) => void) | undefined
    vi.mocked(service.loadBuilds).mockImplementation(() => new Promise((resolve) => {
      finishLoading = resolve
    }))
    render(
      <App
        service={service}
        legacySelectionCleanup={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))

    expect(await screen.findByRole('button', { name: 'Поиск сборок…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Скрыть результаты поиска' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ищем сборки...')).toBeInTheDocument()
    const stopButton = screen.getByRole('button', { name: 'Остановить поиск сборок' })
    fireEvent.click(stopButton)

    expect(screen.queryByRole('button', { name: 'Остановить поиск сборок' })).not.toBeInTheDocument()
    expect(screen.getByText('Не удалось найти сборки')).toBeInTheDocument()
    expect(vi.mocked(service.loadBuilds).mock.calls[0]?.[1]?.signal).toHaveProperty('aborted', true)
    finishLoading?.({ builds: [], transport: 'main-world' })
    await waitFor(() => expect(screen.getByText('Не удалось найти сборки')).toBeInTheDocument())
  })

  it('searches the selected platform and renders only the resolved artifact card', async () => {
    const service = createService()
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    render(
      <App
        service={service}
        legacySelectionCleanup={createStorage()}
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
    expect(screen.getByText('Найдены сборки:')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('TeamCity diagnostic spike')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Открыть билд #42 в TeamCity' }))
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      type: 'teamcity:open-build',
      buildId: '12345',
    }))
    const selection = screen.getByRole('button', { name: 'Выбрать сборку #42' })
    expect(selection).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(selection)
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()
    expect(document.querySelector('.tcba-results__footer'))
      .toHaveStyle('--tcba-results-action-count: 1')

    fireEvent.click(screen.getByRole('button', { name: 'Обновить список проектов' }))
    await waitFor(() => expect(service.loadCatalog).toHaveBeenCalledTimes(2))
  })

  it('loads toolbar and result actions once and executes them through the shared service', async () => {
    const executeAction = vi.fn()
      .mockResolvedValueOnce({ status: 'completed' })
      .mockResolvedValueOnce({ status: 'failed' })
    const gateway: AdditionalActionsGateway = {
      loadActions: vi.fn().mockResolvedValue([
        {
          id: 'toolbar-action',
          placement: 'assistant-toolbar',
          label: 'Быстрое действие',
          tooltip: 'Выполнить дополнительное действие',
          icon: 'action',
          context: 'none',
        },
        {
          id: 'share-builds',
          placement: 'build-results',
          label: 'Поделиться',
          tooltip: 'Передать выбранные сборки',
          icon: 'share',
          context: 'build-selection',
        },
      ]),
      executeAction,
    }
    render(
      <App
        service={createService()}
        legacySelectionCleanup={createStorage()}
        additionalActionsService={createAdditionalActionsService(gateway)}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'Открыть настройки' }))
    const toolbarAction = await screen.findByRole('button', { name: 'Быстрое действие' })
    expect(toolbarAction.closest('.tcba-toolbar__extras'))
      .toHaveStyle('--tcba-toolbar-extra-count: 3')
    fireEvent.click(toolbarAction)
    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Готово: Быстрое действие' })).toBeInTheDocument()

    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('Android Stage')
    const resultAction = screen.getByRole('button', { name: 'Поделиться' })
    expect(resultAction.closest('.tcba-results__footer'))
      .toHaveStyle('--tcba-results-action-count: 2')
    expect(resultAction).toBeDisabled()
    fireEvent.click(resultAction)
    expect(executeAction).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать сборку #42' }))
    expect(resultAction).toBeEnabled()
    fireEvent.click(resultAction)

    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(2))
    expect(executeAction).toHaveBeenLastCalledWith(expect.objectContaining({
      actionId: 'share-builds',
      placement: 'build-results',
      context: {
        type: 'build-selection',
        builds: [expect.objectContaining({
          buildId: '12345',
          buildNumber: '42',
          artifactHref: '/repository/download/synthetic/mobile.ipa',
        })],
      },
    }))
    expect(screen.getByRole('button', { name: 'Ошибка' })).toBeInTheDocument()
    expect(gateway.loadActions).toHaveBeenCalledTimes(1)
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
        legacySelectionCleanup={createStorage()}
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

  it('treats empty platform and environment as all and does not restore old filters', async () => {
    const storage = createStorage()
    const service = createService()
    render(
      <App
        service={service}
        legacySelectionCleanup={storage}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    expect(screen.getByRole('combobox', { name: 'Проект' })).toHaveTextContent('Выберите проект')
    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute('aria-pressed', 'false')
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('Android Stage')

    expect(service.loadBuilds).toHaveBeenCalledWith(
      ['Synthetic_Mobile_android_stage', 'Synthetic_Mobile_ios_prod'],
      expect.objectContaining({ maximumBuilds: 20 }),
    )
    expect(screen.queryByText('Synthetic Custom')).not.toBeInTheDocument()
    expect(storage.clear).toHaveBeenCalledWith('https://teamcity.example.test')
  })

  it('resets the whole workspace on close and preserves only search history', async () => {
    const service = createService()
    const storage = createStorage()
    render(
      <App
        service={service}
        legacySelectionCleanup={storage}
        searchHistoryStorage={createHistoryStorage({
          task: ['TASK-5', 'TASK-4', 'TASK-3', 'TASK-2', 'TASK-1'],
          build: ['105', '104', '103', '102', '101'],
        })}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    fireEvent.click(screen.getByRole('button', { name: 'iOS' }))
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Показать результаты поиска' }))
    expect(screen.getByRole('button', { name: 'Скрыть результаты поиска' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть панель' }))
    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))

    await waitFor(() => expect(service.loadCatalog).toHaveBeenCalledTimes(2))
    expect(storage.clear).toHaveBeenCalledWith('https://teamcity.example.test')
    expect(screen.getByRole('combobox', { name: 'Проект' })).toHaveTextContent('Выберите проект')
    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Показать результаты поиска' })).toHaveAttribute('aria-expanded', 'false')

    const taskInput = screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })
    fireEvent.focus(taskInput)
    expect(screen.getAllByRole('option').filter((option) => option.textContent?.startsWith('TASK-')))
      .toHaveLength(5)
  })

  it('keeps a closed workspace while search is active and resets it after the search settles', async () => {
    const service = createService()
    const storage = createStorage()
    const historyStorage = createHistoryStorage({ task: ['TASK-5'], build: [] })
    let finishLoading: ((value: Awaited<ReturnType<TeamCityService['loadBuilds']>>) => void) | undefined
    vi.mocked(service.loadBuilds).mockImplementation(() => new Promise((resolve) => {
      finishLoading = resolve
    }))
    render(
      <App
        service={service}
        legacySelectionCleanup={storage}
        searchHistoryStorage={historyStorage}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }), {
      target: { value: 'TASK-NEW' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByRole('button', { name: 'Остановить поиск сборок' })
    const refresh = screen.getByRole('button', { name: 'Обновить список проектов' })
    expect(refresh).toBeDisabled()
    fireEvent.click(refresh)
    expect(service.loadCatalog).toHaveBeenCalledTimes(1)

    const clearCountWhileSearching = storage.clear.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть панель' }))
    expect(storage.clear).toHaveBeenCalledTimes(clearCountWhileSearching)
    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    expect(screen.getByRole('combobox', { name: 'Проект' })).toHaveTextContent('Synthetic Mobile')
    expect(screen.getByRole('button', { name: 'Остановить поиск сборок' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть панель' }))
    finishLoading?.({ builds: [], transport: 'main-world' })
    await waitFor(() => expect(historyStorage.save).toHaveBeenCalledWith(
      'https://teamcity.example.test',
      { task: ['TASK-NEW', 'TASK-5'], build: [] },
    ))
    expect(storage.clear).toHaveBeenCalledTimes(clearCountWhileSearching)

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Mobile Build Assistant' }))
    await waitFor(() => expect(service.loadCatalog).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('combobox', { name: 'Проект' })).toHaveTextContent('Выберите проект')
    expect(screen.getByRole('button', { name: 'Показать результаты поиска' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))
    expect(screen.getByRole('option', { name: /^TASK-NEW/ })).toBeInTheDocument()
  })

  it('reveals the always-mounted download action on context menu without selecting the card', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    render(
      <App
        service={createService()}
        legacySelectionCleanup={createStorage()}
        origin="https://teamcity.example.test"
      />,
    )

    await openAssistant()
    selectComboboxOption('Проект', 'Synthetic Mobile')
    fireEvent.click(screen.getByRole('button', { name: 'Поиск сборок' }))
    await screen.findByText('Android Stage')

    const selection = screen.getByRole('button', { name: 'Выбрать сборку #42' })
    const download = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Скачать сборку #42"]',
    )
    expect(download).not.toBeNull()
    if (download === null) {
      return
    }
    expect(download).toHaveAttribute('tabindex', '-1')
    fireEvent.contextMenu(selection)
    expect(selection).toHaveAttribute('aria-pressed', 'false')
    expect(download).toHaveAttribute('tabindex', '0')
    fireEvent.contextMenu(selection)
    expect(download).toHaveAttribute('tabindex', '-1')
    fireEvent.contextMenu(selection)
    expect(download).toHaveAttribute('tabindex', '0')

    fireEvent.click(download)
    expect(download).toHaveAttribute('tabindex', '-1')
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      type: 'teamcity:open-artifact',
      contentHref: '/repository/download/synthetic/mobile.ipa',
    }))
    expect(await screen.findByText('Началась скачка')).toBeInTheDocument()
  })
})
