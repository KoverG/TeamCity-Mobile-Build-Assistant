import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildArtifactMatch } from '../../../src/teamcity/BuildArtifactSearch'
import { BuildResults } from '../../../src/content/assistant/BuildResults'

afterEach(cleanup)

const match: BuildArtifactMatch = {
  build: {
    id: 'synthetic-build',
    buildTypeId: 'Synthetic_Android',
    number: '42',
    branchName: 'feature/synthetic',
    defaultBranch: false,
    finishDate: '20260811T101500+0000',
  },
  configuration: {
    id: 'Synthetic_Android',
    name: 'Android',
    platform: 'android',
  },
  artifact: {
    name: 'synthetic.apk',
    fullName: 'artifacts/synthetic.apk',
    contentHref: '/repository/download/synthetic.apk',
    size: 1024,
  },
}

describe('BuildResults partial search warning', () => {
  it('keeps successful matches visible and allows retrying failed checks', () => {
    const onRetry = vi.fn()

    render(
      <BuildResults
        status="ready"
        hasSearched
        warningMessage="Результаты неполные: не удалось проверить 1 из 3 сборок."
        matches={[match]}
        selectedBuildIds={new Set()}
        onRetry={onRetry}
        onToggle={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
        onOpenBuild={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Результаты неполные: не удалось проверить 1 из 3 сборок.',
    )
    expect(screen.getByRole('button', { name: 'Открыть билд #42 в TeamCity' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('keeps found cards visible and replaces the bulk copy action while search continues', () => {
    render(
      <BuildResults
        status="loading"
        hasSearched
        matches={[match]}
        selectedBuildIds={new Set()}
        onRetry={vi.fn()}
        onToggle={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
        onOpenBuild={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Открыть билд #42 в TeamCity' })).toBeVisible()
    expect(screen.getByRole('status', { name: 'Поиск сборок продолжается' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Копировать все/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Ищем сборки...')).not.toBeInTheDocument()
  })
})
