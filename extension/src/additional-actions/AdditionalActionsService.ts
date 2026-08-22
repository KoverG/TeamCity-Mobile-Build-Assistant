export type AdditionalActionPlacement = 'assistant-toolbar' | 'build-results'

export type AdditionalActionIconId = 'action' | 'export' | 'share'

export interface AdditionalActionBuildReference {
  buildId: string
  buildNumber: string
  artifactName: string
  artifactHref: string
  platform: 'android' | 'ios'
}

export type AdditionalActionContext =
  | { type: 'none' }
  | { type: 'build-selection'; builds: readonly AdditionalActionBuildReference[] }

export interface AdditionalActionDescriptor {
  id: string
  placement: AdditionalActionPlacement
  label: string
  tooltip: string
  icon: AdditionalActionIconId
  context: AdditionalActionContext['type']
}

export interface AdditionalActionExecutionRequest {
  requestId: string
  actionId: string
  placement: AdditionalActionPlacement
  context: AdditionalActionContext
}

export interface AdditionalActionExecutionResult {
  status: 'completed' | 'failed' | 'unavailable'
}

export interface AdditionalActionsGateway {
  loadActions(): Promise<unknown>
  executeAction(request: AdditionalActionExecutionRequest): Promise<unknown>
}

const maximumActions = 8
const maximumActionsPerPlacement = 2
let fallbackRequestSequence = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsDisallowedTextCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true
    }
  }
  return false
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !containsDisallowedTextCharacter(value)
  )
}

function parseContextValue(value: AdditionalActionContext): AdditionalActionContext | undefined {
  if (value.type === 'none') {
    return { type: 'none' }
  }
  if (!Array.isArray(value.builds) || value.builds.length === 0 || value.builds.length > 20) {
    return undefined
  }

  const builds: AdditionalActionBuildReference[] = []
  const buildIds = new Set<string>()
  for (const build of value.builds) {
    if (
      !isBoundedText(build.buildId, 128) ||
      !isBoundedText(build.buildNumber, 128) ||
      !isBoundedText(build.artifactName, 256) ||
      !isBoundedText(build.artifactHref, 2_048) ||
      !build.artifactHref.startsWith('/') ||
      build.artifactHref.startsWith('//') ||
      (build.platform !== 'android' && build.platform !== 'ios') ||
      buildIds.has(build.buildId)
    ) {
      return undefined
    }
    buildIds.add(build.buildId)
    builds.push({
      buildId: build.buildId,
      buildNumber: build.buildNumber,
      artifactName: build.artifactName,
      artifactHref: build.artifactHref,
      platform: build.platform,
    })
  }

  return { type: 'build-selection', builds }
}

function parsePlacement(value: unknown): AdditionalActionPlacement | undefined {
  return value === 'assistant-toolbar' || value === 'build-results' ? value : undefined
}

function parseIcon(value: unknown): AdditionalActionIconId | undefined {
  return value === 'action' || value === 'export' || value === 'share' ? value : undefined
}

function parseContext(value: unknown): AdditionalActionContext['type'] | undefined {
  return value === 'none' || value === 'build-selection' ? value : undefined
}

function parseActions(value: unknown): readonly AdditionalActionDescriptor[] {
  if (!Array.isArray(value) || value.length > maximumActions) {
    return []
  }

  const actions: AdditionalActionDescriptor[] = []
  const identifiers = new Set<string>()
  const placementCounts = new Map<AdditionalActionPlacement, number>()

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return []
    }

    const placement = parsePlacement(candidate.placement)
    const icon = parseIcon(candidate.icon)
    const context = parseContext(candidate.context)
    if (
      !isBoundedText(candidate.id, 64) ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(candidate.id) ||
      !isBoundedText(candidate.label, 48) ||
      !isBoundedText(candidate.tooltip, 120) ||
      placement === undefined ||
      icon === undefined ||
      context === undefined ||
      (placement === 'assistant-toolbar' && context !== 'none') ||
      (placement === 'build-results' && context !== 'build-selection') ||
      identifiers.has(candidate.id)
    ) {
      return []
    }

    const placementCount = (placementCounts.get(placement) ?? 0) + 1
    if (placementCount > maximumActionsPerPlacement) {
      return []
    }

    identifiers.add(candidate.id)
    placementCounts.set(placement, placementCount)
    actions.push({
      id: candidate.id,
      placement,
      label: candidate.label,
      tooltip: candidate.tooltip,
      icon,
      context,
    })
  }

  return actions
}

function parseExecutionResult(value: unknown): AdditionalActionExecutionResult {
  if (!isRecord(value)) {
    return { status: 'failed' }
  }
  return value.status === 'completed' || value.status === 'failed' || value.status === 'unavailable'
    ? { status: value.status }
    : { status: 'failed' }
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  fallbackRequestSequence += 1
  return `additional-action-${Date.now()}-${fallbackRequestSequence}`
}

export class NullAdditionalActionsGateway implements AdditionalActionsGateway {
  async loadActions(): Promise<unknown> {
    return []
  }

  async executeAction(): Promise<unknown> {
    return { status: 'unavailable' }
  }
}

export class AdditionalActionsService {
  private actions: readonly AdditionalActionDescriptor[] = []
  private loadPromise?: Promise<readonly AdditionalActionDescriptor[]>

  constructor(private readonly gateway: AdditionalActionsGateway) {}

  async loadActions(): Promise<readonly AdditionalActionDescriptor[]> {
    if (this.loadPromise === undefined) {
      this.loadPromise = this.loadFromGateway()
    }
    return this.loadPromise
  }

  private async loadFromGateway(): Promise<readonly AdditionalActionDescriptor[]> {
    try {
      this.actions = parseActions(await this.gateway.loadActions())
    } catch {
      this.actions = []
    }
    return this.actions
  }

  async executeAction(
    actionId: string,
    context: AdditionalActionContext,
  ): Promise<AdditionalActionExecutionResult> {
    const action = this.actions.find((candidate) => candidate.id === actionId)
    const parsedContext = parseContextValue(context)
    if (
      action === undefined ||
      parsedContext === undefined ||
      action.context !== parsedContext.type
    ) {
      return { status: 'unavailable' }
    }

    try {
      const result = await this.gateway.executeAction({
        requestId: createRequestId(),
        actionId: action.id,
        placement: action.placement,
        context: parsedContext,
      })
      return parseExecutionResult(result)
    } catch {
      return { status: 'failed' }
    }
  }
}

export function createAdditionalActionsService(
  gateway: AdditionalActionsGateway = new NullAdditionalActionsGateway(),
): AdditionalActionsService {
  return new AdditionalActionsService(gateway)
}
