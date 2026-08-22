import { useContext, useMemo } from 'react'
import type { AdditionalActionPlacement } from '../../additional-actions/AdditionalActionsService'
import { AdditionalActionsContext } from './AdditionalActionsState'

export function useAdditionalActionsAt(placement: AdditionalActionPlacement) {
  const context = useContext(AdditionalActionsContext)
  const actions = useMemo(
    () => context.actions.filter((action) => action.placement === placement),
    [context.actions, placement],
  )
  return { actions, executeAction: context.executeAction }
}
