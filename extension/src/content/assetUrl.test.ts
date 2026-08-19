import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentAssetUrl } from './assetUrl'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('contentAssetUrl', () => {
  it('resolves emitted assets through the extension origin', () => {
    const getURL = vi.fn((path: string) => `chrome-extension://synthetic/${path}`)
    vi.stubGlobal('chrome', { runtime: { getURL } })

    expect(contentAssetUrl('/assets/Main_Hello-synthetic.png'))
      .toBe('chrome-extension://synthetic/assets/Main_Hello-synthetic.png')
    expect(getURL).toHaveBeenCalledWith('assets/Main_Hello-synthetic.png')
  })

  it('leaves inline assets unchanged', () => {
    expect(contentAssetUrl('data:image/svg+xml,synthetic')).toBe('data:image/svg+xml,synthetic')
  })
})
