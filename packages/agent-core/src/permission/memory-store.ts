import type { PermissionDecision } from './types.js'

/**
 * In-memory permission decision store for a single session.
 * Supports both exact-input keys and tool-level keys.
 */
export interface PermissionMemoryStore {
  get(key: string): PermissionDecision | undefined
  set(key: string, decision: PermissionDecision): void
  clear(): void
  size(): number
}

export function createPermissionMemoryStore(): PermissionMemoryStore {
  const decisions = new Map<string, PermissionDecision>()

  return {
    get(key: string): PermissionDecision | undefined {
      return decisions.get(key)
    },

    set(key: string, decision: PermissionDecision): void {
      decisions.set(key, decision)
    },

    clear(): void {
      decisions.clear()
    },

    size(): number {
      return decisions.size
    },
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

export function buildInputKey(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  return `${toolName}:${stableStringify(toolInput)}`
}

export function buildToolKey(toolName: string): string {
  return `tool:${toolName}`
}
