import { DiagnosticEventStore } from './DiagnosticEventStore'

function compactText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export class DiagnosticUiObserver {
  private root?: ShadowRoot

  public constructor(private readonly store: DiagnosticEventStore) {}

  public attach(root: ShadowRoot): void {
    if (!this.store.enabled || this.root === root) {
      return
    }
    this.detach()
    this.root = root
    root.addEventListener('click', this.handleClick, true)
    root.addEventListener('change', this.handleChange, true)
  }

  public detach(): void {
    this.root?.removeEventListener('click', this.handleClick, true)
    this.root?.removeEventListener('change', this.handleChange, true)
    this.root = undefined
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    const button = target.closest('button')
    if (button === null || button.closest('.tcba-debug') !== null) {
      return
    }
    if (button.classList.contains('tcba-launcher')) {
      this.store.emit(
        'UI',
        'info',
        button.getAttribute('aria-expanded') === 'true' ? 'Панель закрыта.' : 'Панель открыта.',
      )
      return
    }
    const label = compactText(button.getAttribute('aria-label') ?? button.textContent)
    if (label.length > 0) {
      this.store.emit('UI', 'info', `Кнопка «${label}».`)
    }
  }

  private readonly handleChange = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return
    }
    const label = compactText(target.closest('label')?.querySelector('span')?.textContent)
    if (label.length === 0) {
      return
    }
    const suffix = target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked ? 'включено' : 'выключено'
      : 'изменён'
    this.store.emit('UI', 'info', `${label}: ${suffix}.`)
  }
}
