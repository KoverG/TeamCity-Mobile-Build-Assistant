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
  const assistantOnlySelectors = /\.tcba-(assistant(?:\b|__|--)|toolbar(?:\b|__|--)|combobox(?:\b|__|--)|platform(?:\b|__|--)|results(?:\b|__|--)|build-card(?:\b|__|--)|action-button(?:\b|--)|search-button(?:\b|--)|toast\b)/
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
})
