import { useEffect, useId, useRef, useState } from 'react'
import { CheckIcon, ChevronIcon } from './Icons'
import type { ComboboxOption } from './Combobox'
import { eventPathContains } from './eventPath'

interface MultiComboboxProps<T extends string> {
  disabled?: boolean
  label: string
  onToggle(value: T): void
  options: readonly ComboboxOption<T>[]
  placeholder: string
  selected: readonly T[]
}

export function MultiCombobox<T extends string>({
  disabled = false,
  label,
  onToggle,
  options,
  placeholder,
  selected,
}: MultiComboboxProps<T>) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const visibleOpen = open && !disabled
  const selectedSet = new Set(selected)
  const selectedLabels = options
    .filter(({ value }) => selectedSet.has(value))
    .map(({ label: optionLabel }) => optionLabel)
  const valueLabel = selectedLabels.length === 0
    ? placeholder
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `Выбрано: ${selectedLabels.length}`

  useEffect(() => {
    if (!visibleOpen) {
      return
    }
    const closeOutside = (event: PointerEvent) => {
      const trigger = triggerRef.current
      const list = listRef.current
      if ((trigger === null || !eventPathContains(event, trigger))
        && (list === null || !eventPathContains(event, list))) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [visibleOpen])

  return (
    <div className={`tcba-combobox${visibleOpen ? ' tcba-combobox--open' : ''}`}>
      <span className="tcba-field-label" id={`${id}-label`}>{label}</span>
      <button
        className="tcba-combobox__trigger"
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={`${id}-listbox`}
        aria-expanded={visibleOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      >
        <span className={selectedLabels.length === 0 ? 'tcba-combobox__placeholder' : undefined}>
          {valueLabel}
        </span>
        <ChevronIcon className="tcba-combobox__chevron" />
      </button>
      {visibleOpen && (
        <ul
          ref={listRef}
          className="tcba-field-dropdown tcba-combobox__list tcba-scroll-viewport"
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const checked = selectedSet.has(option.value)
            return (
              <li
                className="tcba-field-option"
                key={option.value}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                onClick={() => onToggle(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onToggle(option.value)
                  }
                }}
              >
                <span className="tcba-field-option__label">{option.label}</span>
                {checked && <CheckIcon className="tcba-combobox__option-check" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
