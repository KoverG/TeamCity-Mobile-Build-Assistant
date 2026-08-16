import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Combobox } from './Combobox'

afterEach(() => {
  cleanup()
})

const options = Array.from({ length: 7 }, (_, index) => ({
  value: `project-${index + 1}`,
  label: `Project-${index + 1}`,
}))

describe('Combobox', () => {
  it('keeps the universal viewport free of per-instance styles and the final option separator-free', () => {
    const { container } = render(
      <Combobox
        label="Проект"
        value=""
        placeholder="Выберите проект"
        options={options}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Проект' }))

    const list = screen.getByRole('listbox')
    expect(list).not.toHaveAttribute('style')
    expect(list).toHaveClass('tcba-scroll-viewport')
    expect(container.querySelectorAll('.tcba-combobox__option')).toHaveLength(7)
    expect(container.querySelector('.tcba-combobox__option:last-child')).toHaveTextContent('Project-7')
  })

  it('keeps the chevron in the trigger and shows the mockup check only in the selected option', () => {
    const { container } = render(
      <Combobox
        label="Проект"
        value="project-2"
        placeholder="Выберите проект"
        options={options}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.tcba-combobox__chevron')).toBeInTheDocument()
    expect(container.querySelector('.tcba-combobox__option-check')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('combobox', { name: 'Проект' }))

    expect(container.querySelector('.tcba-combobox__chevron')).toBeInTheDocument()
    expect(container.querySelectorAll('.tcba-combobox__option-check')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Project-2' }).querySelector('.tcba-combobox__option-check path')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Project-1' }).querySelector('.tcba-combobox__option-check')).not.toBeInTheDocument()
  })
})
