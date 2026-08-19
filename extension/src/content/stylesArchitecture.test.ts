/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readStyles(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('content style boundaries', () => {
  const tokenStyles = readStyles('./tokens.css')
  const navTabStyles = readStyles('./TeamCityNavTab.css')
  const panelStyles = readStyles('./AssistantPanel.css')
  const resultStyles = readStyles('./assistant/BuildResults.css')
  const assistantStyles = [
    panelStyles,
    readStyles('./assistant/AssistantControls.css'),
    resultStyles,
  ].join('\n')
  const diagnosticStyles = readStyles('../diagnostics/DiagnosticConsole.css')
  const assistantOnlySelectors = /\.tcba-(assistant(?:\b|__|--)|assistant-workspace(?:\b|--)|toolbar(?:\b|__|--)|combobox(?:\b|__|--)|field-(?:dropdown|option)(?:\b|__|--)|platform(?:\b|__|--)|search-field(?:\b|__|--)|results(?:\b|__|--)|build-row(?:\b|__|--)|build-card(?:\b|__|--)|action-button(?:\b|--)|search-button(?:\b|--)|toast\b)/
  const navTabOnlySelectors = /\.tcba-(shell(?:\b|--)|nav-tab(?:\b|__|--)|tab__(?:\w|-)+|launcher\b|panel-stack\b)/

  it('keeps component selectors out of shared tokens', () => {
    expect(tokenStyles).not.toContain('.tcba-shell')
    expect(tokenStyles).not.toContain('.tcba-assistant')
    expect(tokenStyles).not.toContain('.tcba-debug')
    expect(tokenStyles).not.toContain('--tcba-tab-color')
    expect(tokenStyles).not.toContain('--tcba-color-primary')
  })

  it('keeps assistant visuals out of the navigation tab stylesheet', () => {
    expect(navTabStyles).not.toMatch(assistantOnlySelectors)
  })

  it('keeps navigation tab visuals out of the assistant stylesheets', () => {
    expect(assistantStyles).not.toMatch(navTabOnlySelectors)
  })

  it('keeps diagnostic styles independent from assistant and navigation styles', () => {
    expect(diagnosticStyles).not.toMatch(assistantOnlySelectors)
    expect(diagnosticStyles).not.toMatch(navTabOnlySelectors)
    expect(diagnosticStyles).not.toContain('--tcba-panel-stack-available')
    expect(assistantStyles).not.toContain('.tcba-debug')
    expect(navTabStyles).not.toContain('.tcba-debug')
  })

  it('keeps neutral hover lighter than the surface and separate from primary actions', () => {
    expect(panelStyles).toContain('--tcba-color-surface: #f7f7f7')
    expect(panelStyles).toContain('--tcba-color-neutral-button-hover: #fcfcfc')
    expect(resultStyles).toContain(
      '.tcba-action-button:hover:not(.tcba-action-button--secondary)',
    )
    expect(resultStyles).toContain(
      '.tcba-action-button--secondary:hover:not(:disabled):not([aria-disabled="true"])',
    )
  })

  it('shares one dropdown surface and option primitive across selects and search history', () => {
    const controlStyles = readStyles('./assistant/AssistantControls.css')
    expect(controlStyles.match(/\.tcba-field-dropdown\s*\{/g)).toHaveLength(1)
    expect(controlStyles.match(/\.tcba-field-option\s*\{/g)).toHaveLength(1)
    expect(controlStyles).not.toMatch(/\.tcba-search-field__history\s*\{[^}]*background:/s)
    expect(controlStyles).toMatch(/\.tcba-search-field__modes\s*\{[^}]*width: 55px;[^}]*height: 21px;[^}]*padding: 1px;/s)
    expect(controlStyles).toMatch(/\.tcba-search-field__modes::before\s*\{[^}]*width: 25px;[^}]*height: 17px;/s)
    expect(controlStyles).toMatch(/\.tcba-search-field__modes--task::before\s*\{[^}]*translateX\(26px\)/s)
    expect(controlStyles).toMatch(/\.tcba-search-field__modes button\s*\{[^}]*height: 17px;/s)
    expect(controlStyles).toMatch(/\.tcba-search-field__history-actions\s*\{[^}]*height: 34px;/s)
  })

  it('keeps the result surface under the main panel with the SVG dimensions', () => {
    expect(panelStyles).toContain('inset-inline-start: 241px')
    expect(panelStyles).toContain('width: 400px')
    expect(resultStyles).toContain('padding-inline: 68px 10px')
    expect(resultStyles).toContain('border-radius: 14px')
    expect(panelStyles).toMatch(/\.tcba-assistant\s*\{[^}]*border: 1px solid #d8d8d8;/s)
    expect(resultStyles).toMatch(/\.tcba-results\s*\{[^}]*border: 1px solid #d8d8d8;/s)
    expect(resultStyles).not.toMatch(/\.tcba-results\s*\{[^}]*box-shadow:/s)
    expect(resultStyles).toMatch(/\.tcba-results__viewport\s*\{[^}]*position: absolute;[^}]*inset-block: 33px 51px;[^}]*inset-inline: 1px;/s)
    expect(resultStyles).toMatch(/\.tcba-results__list\s*\{[^}]*padding-block: 14px;[^}]*padding-inline: 68px 20px;/s)
    expect(resultStyles).toMatch(/\.tcba-build-row\s*\{[^}]*overflow: visible;/s)
    expect(resultStyles).toMatch(/\.tcba-results__footer\s*\{[^}]*grid-row: 3;/s)
    expect(panelStyles).toMatch(/\.tcba-results-clip\s*\{[^}]*border-radius: 14px;/s)
    expect(panelStyles).toMatch(/\.tcba-results-handle path\s*\{[^}]*stroke-width: 3;/s)
  })
})
