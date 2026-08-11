import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChromeSelectionStorage } from './SelectionStorage'

const values: Record<string, unknown> = {}

beforeEach(() => {
  for (const key of Object.keys(values)) {
    delete values[key]
  }
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(values, items)),
        remove: vi.fn(async (key: string) => {
          delete values[key]
        }),
      },
    },
  })
})

describe('ChromeSelectionStorage', () => {
  it('isolates remembered selections by runtime TeamCity origin', async () => {
    const storage = new ChromeSelectionStorage()
    const first = { projectId: 'SyntheticA', os: 'Android', environment: 'Staging' } as const
    const second = { projectId: 'SyntheticB', os: 'iOS', environment: 'Production' } as const

    await storage.save('https://one.example.test/path', first)
    await storage.save('https://two.example.test/other', second)

    await expect(storage.load('https://one.example.test')).resolves.toEqual(first)
    await expect(storage.load('https://two.example.test')).resolves.toEqual(second)
  })

  it('removes only the current origin selection', async () => {
    const storage = new ChromeSelectionStorage()
    const selection = { projectId: 'Synthetic', os: 'Android', environment: 'Preview' } as const
    await storage.save('https://one.example.test', selection)
    await storage.save('https://two.example.test', selection)

    await storage.clear('https://one.example.test')

    await expect(storage.load('https://one.example.test')).resolves.toBeUndefined()
    await expect(storage.load('https://two.example.test')).resolves.toEqual(selection)
  })
})
