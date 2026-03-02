/** Sync result from @codeck/sessions incremental sync. */
export interface SyncResult {
  readonly newProjects: number
  readonly updatedSessions: number
  readonly newSessions: number
  readonly skippedSessions: number
  readonly errors: readonly string[]
  readonly durationMs: number
}
