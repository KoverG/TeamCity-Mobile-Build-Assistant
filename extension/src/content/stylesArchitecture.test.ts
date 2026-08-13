import { describe, expect, it } from 'vitest'
import panelStyles from './AssistantPanel.css?inline'
import navTabStyles from './TeamCityNavTab.css?inline'
import tokenStyles from './tokens.css?inline'

describe('content style boundaries', () => {
  const panelOnlySelectors = /\.tcba-(panel(?:\b|__|--)|form\b|result(?:\b|--)|status\b|button(?:\b|--)|icon-button\b)/
  const navTabOnlySelectors = /\.tcba-(shell(?:\b|--)|nav-tab(?:\b|__|--)|tab__(?:\w|-)+|launcher\b|panel-stack\b)/

  it('keeps component selectors out of shared tokens', () => {
    expect(tokenStyles).not.toContain('.tcba-shell')
    expect(tokenStyles).not.toContain('.tcba-panel')
    expect(tokenStyles).not.toContain('--tcba-tab-color')
    expect(tokenStyles).not.toContain('--tcba-color-primary')
  })

  it('keeps panel visuals out of the navigation tab stylesheet', () => {
    expect(navTabStyles).not.toMatch(panelOnlySelectors)
  })

  it('keeps navigation tab visuals out of the panel stylesheet', () => {
    expect(panelStyles).not.toMatch(navTabOnlySelectors)
  })

  it('does not define the same class selector in both component stylesheets', () => {
    const classNames = (css: string) => new Set(css.match(/\.tcba-[a-z0-9_-]+/g) ?? [])
    const panelClassNames = classNames(panelStyles)
    const sharedClassNames = [...classNames(navTabStyles)]
      .filter((className) => panelClassNames.has(className))

    expect(sharedClassNames).toEqual([])
  })
})
