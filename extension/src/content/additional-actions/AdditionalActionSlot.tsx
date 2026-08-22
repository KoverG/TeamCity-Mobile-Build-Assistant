import { useState } from 'react'
import type {
  AdditionalActionContext,
  AdditionalActionDescriptor,
  AdditionalActionExecutionResult,
  AdditionalActionIconId,
  AdditionalActionPlacement,
} from '../../additional-actions/AdditionalActionsService'
import { ActionIcon, CheckIcon, CloseIcon, ExportIcon, ShareIcon } from '../assistant/Icons'
import { IconButton } from '../assistant/IconButton'
import { useAdditionalActionsAt } from './useAdditionalActionsAt'

function AdditionalActionGlyph({ icon }: { icon: AdditionalActionIconId }) {
  if (icon === 'export') {
    return <ExportIcon />
  }
  if (icon === 'share') {
    return <ShareIcon />
  }
  return <ActionIcon />
}

function AdditionalActionControl({
  action,
  appearance,
  tabIndex,
  pending,
  disabled,
  outcome,
  onExecute,
}: {
  action: AdditionalActionDescriptor
  appearance: 'icon' | 'button'
  tabIndex?: number
  pending: boolean
  disabled: boolean
  outcome?: AdditionalActionExecutionResult['status']
  onExecute(): void
}) {
  const outcomeText = outcome === 'completed'
    ? 'Готово'
    : outcome === 'failed'
      ? 'Ошибка'
      : outcome === 'unavailable'
        ? 'Недоступно'
        : undefined
  const accessibleLabel = outcomeText === undefined
    ? action.label
    : `${outcomeText}: ${action.label}`
  const title = disabled
    ? 'Сначала выберите хотя бы одну сборку'
    : outcomeText ?? action.tooltip
  const glyph = outcome === 'completed'
    ? <CheckIcon />
    : outcome === 'failed'
      ? <CloseIcon />
      : <AdditionalActionGlyph icon={action.icon} />

  if (appearance === 'icon') {
    return (
      <IconButton
        label={accessibleLabel}
        title={title}
        tone="primary"
        tabIndex={tabIndex}
        disabled={disabled || pending}
        aria-busy={pending}
        aria-live="polite"
        data-additional-action-id={action.id}
        onClick={onExecute}
      >
        {glyph}
      </IconButton>
    )
  }

  return (
    <button
      className="tcba-action-button"
      type="button"
      title={title}
      disabled={disabled || pending}
      aria-busy={pending}
      aria-live="polite"
      data-additional-action-id={action.id}
      onClick={onExecute}
    >
      {glyph}
      <span>{outcomeText ?? action.label}</span>
    </button>
  )
}

export function AdditionalActionSlot({
  placement,
  context,
  appearance,
  tabIndex,
  disabled = false,
}: {
  placement: AdditionalActionPlacement
  context: AdditionalActionContext
  appearance: 'icon' | 'button'
  tabIndex?: number
  disabled?: boolean
}) {
  const { actions, executeAction } = useAdditionalActionsAt(placement)
  const [pendingActionId, setPendingActionId] = useState<string>()
  const [outcome, setOutcome] = useState<{
    actionId: string
    contextKey: string
    status: AdditionalActionExecutionResult['status']
  }>()
  const compatibleActions = actions.filter((action) => action.context === context.type)
  const contextKey = context.type === 'none'
    ? 'none'
    : context.builds.map((build) => build.buildId).join('\n')

  async function execute(action: AdditionalActionDescriptor) {
    if (pendingActionId !== undefined) {
      return
    }
    setPendingActionId(action.id)
    setOutcome(undefined)
    try {
      const result = await executeAction(action.id, context)
      setOutcome({ actionId: action.id, contextKey, status: result.status })
    } finally {
      setPendingActionId(undefined)
    }
  }

  return compatibleActions.map((action) => (
    <AdditionalActionControl
      key={action.id}
      action={action}
      appearance={appearance}
      tabIndex={tabIndex}
      pending={pendingActionId !== undefined}
      disabled={disabled}
      outcome={outcome?.actionId === action.id && outcome.contextKey === contextKey
        ? outcome.status
        : undefined}
      onExecute={() => void execute(action)}
    />
  ))
}
