/**
 * Public API types for @codeck/sessions.
 * These are consumed by codeck via pnpm workspace reference.
 */

/** Default port the cc-desk-sessions server listens on. */
export const SESSIONS_SERVER_PORT = 3579

/** Base URL of the running cc-desk-sessions server. */
export const SESSIONS_SERVER_URL = `http://localhost:${SESSIONS_SERVER_PORT}`

/**
 * A single session entry returned by GET /api/history.
 * Intentionally compatible with cc-desk's HistoryEntry interface.
 */
export interface HistoryEntry {
  sessionId: string
  title: string
  projectPath: string
  sessionFile: string
  lastActiveAt: number
  messageCount: number
  /** UUID of first root user message; used to deduplicate resumed sessions. */
  conversationRoot?: string
}

/** Response shape from GET /api/sync and POST /api/sync/full. */
export interface SyncResult {
  newProjects: number
  updatedSessions: number
  newSessions: number
  skippedSessions: number
  errors: string[]
  durationMs: number
}

/** Response shape from GET /api/ping — used for readiness detection. */
export interface PingResponse {
  ok: true
}

/** Response shape from GET /api/stats. */
export interface OverviewStats {
  projectCount: number
  sessionCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}
