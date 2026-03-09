import type { PermissionMode, RuntimeProvider } from './execution'
import type { WorktreeInfo } from './worktree'

// ── 会话 ──

export interface Session {
  readonly id: string
  readonly name: string
  readonly projectPath: string
  readonly runtime: RuntimeProvider
  readonly permissionMode: PermissionMode
  readonly createdAt: number
  readonly updatedAt: number
  readonly worktree?: WorktreeInfo
  readonly parentSessionId?: string
  readonly role?: string
  readonly isTeamSession?: boolean
}

export interface CreateSessionInput {
  readonly name: string
  readonly projectPath: string
  readonly runtime?: RuntimeProvider
  readonly permissionMode: PermissionMode
  /** Create session in an isolated git worktree. */
  readonly useWorktree?: boolean
  readonly parentSessionId?: string
  readonly role?: string
  readonly isTeamSession?: boolean
}

// ── 会话状态 ──

export type SessionStatus = "idle" | "streaming" | "waiting_permission" | "error"

export interface SessionState {
  readonly sessionId: string
  readonly status: SessionStatus
  readonly error?: string
}

export interface ResumeSessionResult {
  readonly success: boolean
  readonly session: Session | null
  readonly messages: readonly import('./message').Message[]
}

/** State of the backend session manager, pushed to renderer on change.
 *  Retained for backward compatibility — derived from focused session in multi-session mode. */
export interface SessionManagerState {
  readonly currentSessionId: string | null
  readonly currentProjectPath: string | null
  readonly sdkSessionId: string | null
  readonly sessionStatus: SessionState["status"]
  readonly currentError: string | null
}
