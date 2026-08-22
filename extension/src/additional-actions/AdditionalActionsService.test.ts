import { describe, expect, it, vi } from 'vitest'
import {
  createAdditionalActionsService,
  NullAdditionalActionsGateway,
  type AdditionalActionsGateway,
} from './AdditionalActionsService'

function createGateway(actions: unknown): AdditionalActionsGateway & {
  executeAction: ReturnType<typeof vi.fn>
} {
  return {
    loadActions: vi.fn().mockResolvedValue(actions),
    executeAction: vi.fn().mockResolvedValue({ status: 'completed' }),
  }
}

describe('AdditionalActionsService', () => {
  it('keeps the base application independent by returning no actions by default', async () => {
    const service = createAdditionalActionsService(new NullAdditionalActionsGateway())

    await expect(service.loadActions()).resolves.toEqual([])
    await expect(service.executeAction('missing', { type: 'none' }))
      .resolves.toEqual({ status: 'unavailable' })
  })

  it('loads bounded descriptors and executes a registered action through one gateway', async () => {
    const gateway = createGateway([
      {
        id: 'share-selection',
        placement: 'build-results',
        label: 'Поделиться',
        tooltip: 'Передать выбранные сборки',
        icon: 'share',
        context: 'build-selection',
        endpoint: 'https://untrusted.example.invalid/action',
      },
    ])
    const service = createAdditionalActionsService(gateway)

    const firstLoad = service.loadActions()
    const secondLoad = service.loadActions()
    await expect(firstLoad).resolves.toEqual([
      {
        id: 'share-selection',
        placement: 'build-results',
        label: 'Поделиться',
        tooltip: 'Передать выбранные сборки',
        icon: 'share',
        context: 'build-selection',
      },
    ])
    await expect(secondLoad).resolves.toEqual(await firstLoad)
    expect(gateway.loadActions).toHaveBeenCalledTimes(1)

    await expect(service.executeAction('share-selection', {
      type: 'build-selection',
      builds: [{
        buildId: '100',
        buildNumber: '42',
        artifactName: 'synthetic.apk',
        artifactHref: '/repository/download/synthetic/synthetic.apk',
        platform: 'android',
      }],
    })).resolves.toEqual({ status: 'completed' })
    expect(gateway.executeAction).toHaveBeenCalledWith(expect.objectContaining({
      actionId: 'share-selection',
      placement: 'build-results',
      requestId: expect.any(String),
    }))
  })

  it('fails closed for malformed, duplicate, excessive, or incompatible descriptors', async () => {
    const invalidSets = [
      [{ id: 'invalid', placement: 'unknown', label: 'Действие', tooltip: 'Описание', icon: 'action', context: 'none' }],
      [
        { id: 'duplicate', placement: 'assistant-toolbar', label: 'Первое', tooltip: 'Описание', icon: 'action', context: 'none' },
        { id: 'duplicate', placement: 'assistant-toolbar', label: 'Второе', tooltip: 'Описание', icon: 'action', context: 'none' },
      ],
      [
        { id: 'one', placement: 'assistant-toolbar', label: 'Первое', tooltip: 'Описание', icon: 'action', context: 'none' },
        { id: 'two', placement: 'assistant-toolbar', label: 'Второе', tooltip: 'Описание', icon: 'action', context: 'none' },
        { id: 'three', placement: 'assistant-toolbar', label: 'Третье', tooltip: 'Описание', icon: 'action', context: 'none' },
      ],
      [{ id: 'wrong-context', placement: 'assistant-toolbar', label: 'Действие', tooltip: 'Описание', icon: 'action', context: 'build-selection' }],
    ]

    for (const descriptors of invalidSets) {
      const service = createAdditionalActionsService(createGateway(descriptors))
      await expect(service.loadActions()).resolves.toEqual([])
    }
  })

  it('does not execute unknown actions or actions with a mismatched context', async () => {
    const gateway = createGateway([
      {
        id: 'toolbar-action',
        placement: 'assistant-toolbar',
        label: 'Действие',
        tooltip: 'Выполнить действие',
        icon: 'action',
        context: 'none',
      },
    ])
    const service = createAdditionalActionsService(gateway)
    await service.loadActions()

    await expect(service.executeAction('unknown', { type: 'none' }))
      .resolves.toEqual({ status: 'unavailable' })
    await expect(service.executeAction('toolbar-action', { type: 'build-selection', builds: [] }))
      .resolves.toEqual({ status: 'unavailable' })
    expect(gateway.executeAction).not.toHaveBeenCalled()
  })

  it('does not pass malformed build references to the gateway', async () => {
    const gateway = createGateway([
      {
        id: 'build-action',
        placement: 'build-results',
        label: 'Действие',
        tooltip: 'Выполнить действие',
        icon: 'export',
        context: 'build-selection',
      },
    ])
    const service = createAdditionalActionsService(gateway)
    await service.loadActions()

    await expect(service.executeAction('build-action', {
      type: 'build-selection',
      builds: [{
        buildId: '100',
        buildNumber: '42',
        artifactName: 'synthetic.apk',
        artifactHref: 'https://untrusted.example.invalid/synthetic.apk',
        platform: 'android',
      }],
    })).resolves.toEqual({ status: 'unavailable' })
    expect(gateway.executeAction).not.toHaveBeenCalled()
  })
})
