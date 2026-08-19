export function contentAssetUrl(source: string): string {
  if (source.startsWith('data:') || source.startsWith('blob:')) {
    return source
  }
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.getURL !== 'function') {
    return source
  }
  return chrome.runtime.getURL(source.replace(/^\.\//, '').replace(/^\//, ''))
}
