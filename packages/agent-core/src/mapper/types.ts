/**
 * MessageLike — compatible with app/src/common/types/message.ts Message interface.
 * This type mirrors the frontend Message structure so that mapped events
 * can be directly consumed by message-store and conversation-reducer.
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type MessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'usage'

export interface TokenUsageLike {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

export interface MessageLike {
  readonly id: string
  readonly sessionId: string
  readonly role: MessageRole
  readonly type: MessageType
  readonly content: string
  readonly timestamp: number

  // tool_use
  readonly toolName?: string
  readonly toolInput?: Record<string, unknown>
  readonly toolUseId?: string

  // tool_result
  readonly toolResult?: string
  readonly success?: boolean

  // usage
  readonly usage?: TokenUsageLike

  // stream
  readonly isStreamDelta?: boolean
}
