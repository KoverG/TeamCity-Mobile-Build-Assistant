export type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readOpaqueString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
