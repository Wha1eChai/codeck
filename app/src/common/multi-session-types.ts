// ============================================================
// Multi-Session 类型定义 — 支持并行会话的数据结构
// ============================================================

import type { SessionStatus } from './types'

/** Per-session runtime state tracked by the backend. */
export interface ActiveSessionState {
  readonly sessionId: string
  readonly projectPath: string
  readonly sdkSessionId: string | null
  readonly status: SessionStatus
  readonly error: string | null
  readonly parentSessionId?: string | null
  readonly role?: string | null
}

/** Backend state for multi-session management, pushed to renderer. */
export interface MultiSessionManagerState {
  readonly activeSessions: Readonly<Record<string, ActiveSessionState>>
  readonly focusedSessionId: string | null
  readonly currentProjectPath: string | null
}

/** Which panel is shown beside the Activity Bar. null = collapsed. */
export type SidebarPanel = 'sessions' | 'files' | 'history' | null

/** A tab in the session tab bar. */
export interface SessionTab {
  readonly sessionId: string
  readonly name: string
  readonly status: SessionStatus
  readonly isHistoryPreview?: boolean
  readonly parentSessionId?: string | null
  readonly role?: string | null
}
