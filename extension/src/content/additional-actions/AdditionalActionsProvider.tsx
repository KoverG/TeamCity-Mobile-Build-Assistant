import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AdditionalActionContext,
  AdditionalActionDescriptor,
  AdditionalActionsService,
} from '../../additional-actions/AdditionalActionsService'
import { AdditionalActionsContext } from './AdditionalActionsState'

export function AdditionalActionsProvider({
  service,
  children,
}: {
  service: AdditionalActionsService
  children: ReactNode
}) {
  const [actions, setActions] = useState<readonly AdditionalActionDescriptor[]>([])

  useEffect(() => {
    let active = true
    void service.loadActions().then((loadedActions) => {
      if (active) {
        setActions(loadedActions)
      }
    })
    return () => {
      active = false
    }
  }, [service])

  const executeAction = useCallback(
    (actionId: string, context: AdditionalActionContext) => service.executeAction(actionId, context),
    [service],
  )
  const value = useMemo(() => ({ actions, executeAction }), [actions, executeAction])

  return (
    <AdditionalActionsContext.Provider value={value}>
      {children}
    </AdditionalActionsContext.Provider>
  )
}
