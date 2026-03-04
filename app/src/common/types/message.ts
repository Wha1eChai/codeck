// ── 消息 ──

export type MessageRole = "user" | "assistant" | "system" | "tool"

export type MessageType =
  | "text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "tool_progress"
  | "permission_request"
  | "error"
  | "usage"
  | "compact"

export interface Message {
  readonly id: string
  readonly sessionId: string
  readonly role: MessageRole
  readonly type: MessageType
  readonly content: string
  readonly timestamp: number

  // tool_use / tool_result
  readonly toolName?: string
  readonly toolInput?: Record<string, unknown>
  readonly toolUseId?: string

  // tool_result
  readonly toolResult?: string
  readonly success?: boolean

  // usage
  readonly usage?: TokenUsage

  // stream
  readonly isStreamDelta?: boolean
  readonly isReplay?: boolean

  /** Parent tool_use ID indicating this message came from a sub-agent */
  readonly parentToolUseId?: string

  // hook lifecycle
  readonly hookId?: string
  readonly hookName?: string
  readonly hookEvent?: string
  readonly hookStatus?: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled'
}

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly costUsd?: number
  readonly numTurns?: number
  readonly durationMs?: number
}
