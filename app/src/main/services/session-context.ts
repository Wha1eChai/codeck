// ============================================================
// SessionContext — per-session runtime state for multi-session support
// ============================================================

import type {
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RuntimeProvider,
} from '@common/types'
import type { SessionMetadata, SDKQuery } from './sdk-adapter'
import type { PersistentPermissionStore } from './permission-store'

/** Runtime context for a single active SDK session. */
export interface SessionContext {
  readonly sessionId: string
  readonly projectPath: string
  /** Which runtime adapter this session was started with. Used for routing abort/resolve. */
  runtimeId: RuntimeProvider | null
  abortController: AbortController | null
  permissionResolver: ((r: PermissionResponse) => void) | null
  askUserQuestionResolver: ((r: AskUserQuestionResponse) => void) | null
  exitPlanModeResolver: ((r: ExitPlanModeResponse) => void) | null
  queryRef: SDKQuery | null
  sdkSessionId: string | null
  sessionMetadata: SessionMetadata | null
  permissionStore: PersistentPermissionStore | null
}

/**
 * Manages multiple concurrent SessionContexts.
 * Each active SDK session owns an independent context with its own
 * AbortController, resolver callbacks, and query reference.
 */
export class SessionContextStore {
  private readonly contexts = new Map<string, SessionContext>()

  /** Create a fresh context for a session. Replaces existing if present. */
  create(sessionId: string, projectPath: string): SessionContext {
    // Abort previous context for same session if it exists
    const existing = this.contexts.get(sessionId)
    if (existing?.abortController) {
      existing.abortController.abort()
    }

    const ctx: SessionContext = {
      sessionId,
      projectPath,
      runtimeId: null,
      abortController: null,
      permissionResolver: null,
      askUserQuestionResolver: null,
      exitPlanModeResolver: null,
      queryRef: null,
      sdkSessionId: null,
      sessionMetadata: null,
      permissionStore: null,
    }
    this.contexts.set(sessionId, ctx)
    return ctx
  }

  /** Get an existing context, or undefined. */
  get(sessionId: string): SessionContext | undefined {
    return this.contexts.get(sessionId)
  }

  /** Get or create a context for a session. */
  getOrCreate(sessionId: string, projectPath: string): SessionContext {
    return this.contexts.get(sessionId) ?? this.create(sessionId, projectPath)
  }

  /** Remove a context (after session ends or is closed). */
  remove(sessionId: string): void {
    const ctx = this.contexts.get(sessionId)
    if (ctx?.abortController) {
      ctx.abortController.abort()
    }
    this.contexts.delete(sessionId)
  }

  /** Abort all active sessions (e.g. on app quit). */
  abortAll(): void {
    for (const ctx of this.contexts.values()) {
      if (ctx.abortController) {
        ctx.abortController.abort()
        ctx.abortController = null
      }
      this.resolveAllPending(ctx)
    }
  }

  /** Abort a specific session. */
  abort(sessionId: string): void {
    const ctx = this.contexts.get(sessionId)
    if (!ctx) return
    if (ctx.abortController) {
      ctx.abortController.abort()
      ctx.abortController = null
    }
    this.resolveAllPending(ctx)
  }

  /** List all active session IDs. */
  listSessionIds(): string[] {
    return Array.from(this.contexts.keys())
  }

  /** Get all active contexts. */
  entries(): IterableIterator<[string, SessionContext]> {
    return this.contexts.entries()
  }

  /** Resolve all pending callbacks to prevent promise leaks on abort. */
  private resolveAllPending(ctx: SessionContext): void {
    if (ctx.permissionResolver) {
      ctx.permissionResolver({ requestId: '', allowed: false, reason: 'Session aborted' })
      ctx.permissionResolver = null
    }
    if (ctx.askUserQuestionResolver) {
      ctx.askUserQuestionResolver({ requestId: '', answers: {}, cancelled: true })
      ctx.askUserQuestionResolver = null
    }
    if (ctx.exitPlanModeResolver) {
      ctx.exitPlanModeResolver({ requestId: '', allowed: false, feedback: 'Session aborted' })
      ctx.exitPlanModeResolver = null
    }
  }
}

export const sessionContextStore = new SessionContextStore()
