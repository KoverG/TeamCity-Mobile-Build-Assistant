import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChromeLegacySelectionCleanup } from './LegacySelectionCleanup'

const remove = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  remove.mockClear()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        remove,
      },
    },
  })
})

describe('ChromeLegacySelectionCleanup', () => {
  it('removes the legacy selection for the normalized TeamCity origin', async () => {
    const storage = new ChromeLegacySelectionCleanup()

    await storage.clear('https://one.example.test/path')

    expect(remove).toHaveBeenCalledWith('tcba.selection.v1:https%3A%2F%2Fone.example.test')
  })

  it('does nothing when extension storage is unavailable', async () => {
    vi.stubGlobal('chrome', {})
    const storage = new ChromeLegacySelectionCleanup()

    await expect(storage.clear('https://one.example.test')).resolves.toBeUndefined()
    expect(remove).not.toHaveBeenCalled()
  })
})
