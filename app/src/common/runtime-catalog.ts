import type { RuntimeProvider } from './types'

export interface RuntimeCatalogEntry {
  readonly value: RuntimeProvider
  readonly label: string
  readonly available: boolean
}

export const RUNTIME_CATALOG: readonly RuntimeCatalogEntry[] = [
  { value: 'claude', label: 'Claude (Default)', available: true },
  { value: 'kernel', label: 'Kernel (Self-hosted)', available: true },
  { value: 'codex', label: 'Codex (Coming Soon)', available: false },
  { value: 'opencode', label: 'OpenCode (Coming Soon)', available: false },
] as const

export function isRuntimeAvailable(runtime: unknown): runtime is RuntimeProvider {
  return runtime === 'claude' || runtime === 'kernel'
}
