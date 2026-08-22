import { createContext } from 'react'
import type {
  AdditionalActionContext,
  AdditionalActionDescriptor,
  AdditionalActionExecutionResult,
} from '../../additional-actions/AdditionalActionsService'

export interface AdditionalActionsContextValue {
  actions: readonly AdditionalActionDescriptor[]
  executeAction(
    actionId: string,
    context: AdditionalActionContext,
  ): Promise<AdditionalActionExecutionResult>
}

const unavailableResult: AdditionalActionExecutionResult = { status: 'unavailable' }

export const AdditionalActionsContext = createContext<AdditionalActionsContextValue>({
  actions: [],
  executeAction: async () => unavailableResult,
})
