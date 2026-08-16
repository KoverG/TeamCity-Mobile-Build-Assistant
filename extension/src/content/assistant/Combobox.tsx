import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { CheckIcon, ChevronIcon } from './Icons'
import { OverlayScrollbar } from './ScrollArea'
import { useScrollMetrics } from './useScrollMetrics'

export interface ComboboxOption<T extends string> {
  value: T
  label: string
}

interface ComboboxProps<T extends string> {
  label: string
  value: T | ''
  placeholder: string
  options: readonly ComboboxOption<T>[]
  disabled?: boolean
  onChange(value: T): void
}

export function Combobox<T extends string>({
  label,
  value,
  placeholder,
  options,
  disabled = false,
  onChange,
}: ComboboxProps<T>) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const visibleOpen = open && !disabled
  const selectedIndex = options.findIndex((option) => option.value === value)
  const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0))
  const [keyboardHighlight, setKeyboardHighlight] = useState(false)
  const scrollbar = useScrollMetrics(listRef, `${visibleOpen}:${options.length}`)
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex]?.label : undefined

  useEffect(() => {
    if (!visibleOpen) {
      return
    }
    const closeOutside = (event: PointerEvent) => {
      const root = rootRef.current
      if (root !== null && !event.composedPath().includes(root)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [visibleOpen])

  useEffect(() => {
    if (!visibleOpen || !keyboardHighlight) {
      return
    }
    const activeOption = listRef.current?.children.item(activeIndex)
    if (activeOption instanceof HTMLElement) {
      activeOption.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex, keyboardHighlight, visibleOpen])

  function openList(fromKeyboard = false) {
    if (disabled || options.length === 0) {
      return
    }
    setActiveIndex(Math.max(selectedIndex, 0))
    setKeyboardHighlight(fromKeyboard)
    setOpen(true)
  }

  function select(index: number) {
    const option = options[index]
    if (option === undefined) {
      return
    }
    onChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (visibleOpen) {
        select(activeIndex)
      } else {
        openList(true)
      }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return
    }
    event.preventDefault()
    if (!visibleOpen) {
      openList(true)
      return
    }
    setKeyboardHighlight(true)
    setActiveIndex((current) => {
      if (event.key === 'Home') {
        return 0
      }
      if (event.key === 'End') {
        return Math.max(0, options.length - 1)
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      return Math.min(Math.max(current + delta, 0), Math.max(0, options.length - 1))
    })
  }

  return (
    <div className={`tcba-combobox${visibleOpen ? ' tcba-combobox--open' : ''}`} ref={rootRef}>
      <span className="tcba-field-label" id={`${id}-label`}>{label}</span>
      <button
        className="tcba-combobox__trigger"
        type="button"
        role="combobox"
        aria-controls={`${id}-listbox`}
        aria-expanded={visibleOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-value`}
        aria-activedescendant={visibleOpen ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => visibleOpen ? setOpen(false) : openList()}
        onKeyDown={handleKeyDown}
      >
        <span
          id={`${id}-value`}
          className={selectedLabel === undefined ? 'tcba-combobox__placeholder' : undefined}
        >
          {selectedLabel ?? placeholder}
        </span>
        <ChevronIcon className="tcba-combobox__chevron" />
      </button>
      {visibleOpen && (
        <ul
          ref={listRef}
          className="tcba-combobox__list tcba-scroll-viewport"
          id={`${id}-listbox`}
          role="listbox"
        >
          {options.map((option, index) => (
            <li
              id={`${id}-option-${index}`}
              className={`tcba-combobox__option${keyboardHighlight && index === activeIndex ? ' tcba-combobox__option--active' : ''}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => select(index)}
              onPointerMove={() => {
                setActiveIndex(index)
                setKeyboardHighlight(false)
              }}
            >
              <span className="tcba-combobox__option-label">{option.label}</span>
              {option.value === value && (
                <CheckIcon className="tcba-combobox__option-check" />
              )}
            </li>
          ))}
        </ul>
      )}
      {visibleOpen && (
        <OverlayScrollbar
          className="tcba-combobox__scrollbar"
          metrics={scrollbar}
          thumbWidth={8}
        />
      )}
    </div>
  )
}
