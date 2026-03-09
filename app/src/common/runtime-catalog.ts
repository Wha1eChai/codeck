import type { RuntimeProvider } from './types'

export interface RuntimeCatalogEntry {
  readonly value: RuntimeProvider
  readonly label: string
  readonly available: boolean
}

export const RUNTIME_CATALOG: readonly RuntimeCatalogEntry[] = [
  { value: 'claude', label: 'Claude (Default)', available: true },
  { value: 'kernel', label: 'Kernel (Self-hosted)', available: true },
  { value: 'codex', label: 'Codex (CLI)', available: true },
  { value: 'opencode', label: 'OpenCode (CLI)', available: true },
]

const AVAILABLE_RUNTIMES = new Set(
  RUNTIME_CATALOG.filter(entry => entry.available).map(entry => entry.value),
)

export function isRuntimeAvailable(runtime: unknown): runtime is RuntimeProvider {
  return typeof runtime === 'string' && AVAILABLE_RUNTIMES.has(runtime as RuntimeProvider)
}
