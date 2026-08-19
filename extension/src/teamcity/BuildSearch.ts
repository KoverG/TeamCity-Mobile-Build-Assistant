export type BuildSearchMode = 'task' | 'build'

export interface BuildSearchQuery {
  mode: BuildSearchMode
  value: string
}

export const maximumBuildSearchQueryLength = 128

export function normalizeBuildSearchQuery(value: string): string {
  return value.trim().slice(0, maximumBuildSearchQueryLength)
}
