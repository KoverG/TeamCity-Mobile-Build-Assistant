import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchOptionsField } from '../../../src/content/assistant/SearchOptionsField'

afterEach(() => {
  cleanup()
})

function renderField(overrides: Partial<Parameters<typeof SearchOptionsField>[0]> = {}) {
  const props: Parameters<typeof SearchOptionsField>[0] = {
    currentOptions: ['TEST-1111', 'TEST-2222'],
    currentOptionsStatus: 'ready',
    disabled: false,
    history: { task: ['OLD-100'], build: ['42'] },
    mode: 'task',
    projectSelected: true,
    onClearHistory: vi.fn(),
    onDropdownClose: vi.fn(),
    onModeChange: vi.fn(),
    onQueryChange: vi.fn(),
    onRefresh: vi.fn(),
    onSearch: vi.fn(),
    onStop: vi.fn(),
    queries: { task: '', build: '' },
    ...overrides,
  }
  render(<SearchOptionsField {...props} />)
  return props
}

describe('SearchOptionsField', () => {
  it('opens on focus with current data active and switches to unfiltered history', () => {
    const props = renderField()
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))

    expect(screen.getByRole('tab', { name: 'Текущие данные' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'TEST-1111' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'OLD-100' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Очистить историю поиска' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Обновить текущие данные' }).querySelector('svg'))
      .toHaveAttribute('viewBox', '227 453 12 12')


    fireEvent.click(screen.getByRole('tab', { name: 'История поиска' }))
    expect(screen.getByRole('button', { name: 'Очистить историю поиска' }).querySelector('svg'))
      .toHaveAttribute('viewBox', '354 453 12 13')
    expect(screen.getByRole('option', { name: 'OLD-100' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Обновить текущие данные' })).toBeDisabled()
    fireEvent.click(screen.getByRole('option', { name: 'OLD-100' }))

    expect(props.onQueryChange).toHaveBeenCalledWith('task', 'OLD-100')
  })

  it('reserves the fifth row for loader and keeps dropdown open after Stop', () => {
    const props = renderField({
      currentOptions: ['1', '2', '3', '4', '5', '6'],
      currentOptionsStatus: 'loading',
    })
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))

    expect(screen.getAllByRole('option')).toHaveLength(4)
    const loader = screen.getByLabelText('Загрузка текущих данных')
    expect(loader).toBeInTheDocument()
    expect(loader.querySelector('img')?.getAttribute('src')).toContain('blocks-shuffle-4.svg')
    fireEvent.click(screen.getByRole('button', { name: 'Остановить загрузку текущих данных' }))

    expect(props.onStop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tablist', { name: 'Источник вариантов' })).toBeInTheDocument()
  })

  it('stops a running metadata load when the dropdown closes', () => {
    const props = renderField({ currentOptionsStatus: 'loading' })
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))
    fireEvent.pointerDown(screen.getByText('Поиск'))

    expect(props.onDropdownClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tablist', { name: 'Источник вариантов' })).not.toBeInTheDocument()
  })

  it('closes above the input but keeps clicks inside the input control and dropdown', () => {
    renderField()
    const input = screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })
    fireEvent.focus(input)

    fireEvent.pointerDown(screen.getByText('Поиск'))
    expect(screen.queryByRole('tablist', { name: 'Источник вариантов' })).not.toBeInTheDocument()

    fireEvent.click(input)
    expect(screen.getByRole('tablist', { name: 'Источник вариантов' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('group', { name: 'Режим поиска' }))
    expect(screen.queryByRole('tablist', { name: 'Источник вариантов' })).not.toBeInTheDocument()

    fireEvent.click(input)
    fireEvent.pointerDown(input)
    expect(screen.getByRole('tablist', { name: 'Источник вариантов' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('tablist', { name: 'Источник вариантов' }))
    expect(screen.getByRole('tablist', { name: 'Источник вариантов' })).toBeInTheDocument()
  })

  it('switches to current data after clearing only the active mode history', () => {
    const props = renderField()
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))
    fireEvent.click(screen.getByRole('tab', { name: 'История поиска' }))
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю поиска' }))

    expect(props.onClearHistory).toHaveBeenCalledWith('task')
    expect(screen.getByRole('tab', { name: 'Текущие данные' })).toHaveAttribute('aria-selected', 'true')
  })

  it('replaces current rows with a safe error message', () => {
    renderField({
      currentOptions: [],
      currentOptionsErrorMessage: 'TeamCity вернул ответ неизвестного формата.',
      currentOptionsStatus: 'error',
    })
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))

    expect(screen.getByRole('status')).toHaveTextContent('TeamCity вернул ответ неизвестного формата.')
  })

  it('renders an empty source as exactly one list row', () => {
    renderField({
      currentOptions: [],
      currentOptionsStatus: 'ready',
      history: { task: [], build: [] },
    })
    fireEvent.focus(screen.getByRole('textbox', { name: 'Поиск по номеру задачи' }))

    const list = screen.getByRole('listbox', { name: 'Текущие данные поиска' })
    expect(list.children).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('НЕТ ДАННЫХ')
  })

  it('explains that current data is unavailable until a project is selected', () => {
    renderField({
      currentOptions: [],
      currentOptionsStatus: 'idle',
      projectSelected: false,
    })
    const input = screen.getByRole('textbox', { name: 'Поиск по номеру задачи' })

    expect(input).toBeEnabled()
    fireEvent.focus(input)
    expect(screen.getByRole('status')).toHaveTextContent('НЕ ВЫБРАН ПРОЕКТ')
  })
})
