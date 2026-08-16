import type { MobilePlatform } from '../../teamcity/ArtifactResolver'
import { AndroidIcon, AppleIcon } from './Icons'

interface PlatformFilterProps {
  selected: readonly MobilePlatform[]
  disabled?: boolean
  onToggle(platform: MobilePlatform): void
}

export function PlatformFilter({ selected, disabled = false, onToggle }: PlatformFilterProps) {
  return (
    <fieldset className="tcba-platform" disabled={disabled}>
      <legend className="tcba-field-label">Платформа</legend>
      <div className="tcba-platform__options">
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
      </div>
    </fieldset>
  )
}
