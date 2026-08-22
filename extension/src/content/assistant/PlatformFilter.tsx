import type { AssistantPlatformFilter } from './useAssistantController'
import { AndroidIcon, AppleIcon } from './Icons'

interface PlatformFilterProps {
  selected: readonly AssistantPlatformFilter[]
  showOther: boolean
  disabled?: boolean
  onToggle(platform: AssistantPlatformFilter): void
}

export function PlatformFilter({
  selected,
  showOther,
  disabled = false,
  onToggle,
}: PlatformFilterProps) {
  return (
    <fieldset className="tcba-platform" disabled={disabled}>
      <legend className="tcba-field-label">Платформа</legend>
      <div className={`tcba-platform__options${showOther ? ' tcba-platform__options--with-other' : ''}`}>
        <button
          type="button"
          aria-label="Android"
          aria-pressed={selected.includes('android')}
          onClick={() => onToggle('android')}
        >
          <AndroidIcon />
        </button>
        <button
          type="button"
          aria-label="iOS"
          aria-pressed={selected.includes('ios')}
          onClick={() => onToggle('ios')}
        >
          <AppleIcon />
        </button>
        {showOther && (
          <button
            className="tcba-platform__other"
            type="button"
            aria-label="Другие — конфигурации с нераспознанной платформой"
            title="Конфигурации с нераспознанной платформой"
            aria-pressed={selected.includes('other')}
            onClick={() => onToggle('other')}
          >
            Другие
          </button>
        )}
      </div>
    </fieldset>
  )
}
