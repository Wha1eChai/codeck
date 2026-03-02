// ============================================================
// Persistent Permission Store — project-level permission decisions
// ============================================================

import type { PermissionDecisionSnapshot, PermissionDecisionStore } from './sdk-adapter/permission-adapter'
import { claudeFilesService } from './claude-files'

const PERMISSION_DECISIONS_KEY = 'permissionDecisions'

/**
 * Persists permission decisions to `~/.claude/projects/<hash>/settings.json`
 * under the `ccuiProjectMeta.permissionDecisions` namespace.
 *
 * Uses an immutable internal Map pattern (new Map on every mutation).
 */
export class PersistentPermissionStore implements PermissionDecisionStore {
  private cache = new Map<string, PermissionDecisionSnapshot>()

  constructor(private readonly projectPath: string) {}

  get(key: string): PermissionDecisionSnapshot | undefined {
    return this.cache.get(key)
  }

  set(key: string, decision: PermissionDecisionSnapshot): void {
    const next = new Map(this.cache)
    next.set(key, decision)
    this.cache = next
    // Fire-and-forget persist — errors are non-fatal
    this.save().catch(() => {})
  }

  async load(): Promise<void> {
    const metadata = await claudeFilesService.getProjectMetadata(this.projectPath)
    const raw = metadata[PERMISSION_DECISIONS_KEY]
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const decisions = raw as Record<string, unknown>
      const next = new Map<string, PermissionDecisionSnapshot>()
      for (const [key, value] of Object.entries(decisions)) {
        if (isValidDecision(value)) {
          next.set(key, value)
        }
      }
      this.cache = next
    }
  }

  async save(): Promise<void> {
    const serialized: Record<string, PermissionDecisionSnapshot> = {}
    for (const [key, value] of this.cache) {
      serialized[key] = value
    }
    await claudeFilesService.updateProjectMetadata(this.projectPath, {
      [PERMISSION_DECISIONS_KEY]: serialized,
    })
  }

  clear(): void {
    this.cache = new Map()
  }
}

function isValidDecision(value: unknown): value is PermissionDecisionSnapshot {
  return (
    value !== null &&
    typeof value === 'object' &&
    'allowed' in value &&
    typeof (value as PermissionDecisionSnapshot).allowed === 'boolean'
  )
}
