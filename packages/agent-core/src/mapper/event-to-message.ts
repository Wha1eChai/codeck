import type { AgentEvent } from '../loop/types.js'
import type { MessageLike, TokenUsageLike } from './types.js'

/**
 * Stateful mapper that converts a stream of AgentEvents into MessageLike objects
 * compatible with the frontend message-store and conversation-reducer.
 *
 * Each AgentEvent maps to 0–1 MessageLike objects. The mapper tracks internal state
 * (current text/thinking block IDs) to produce stable IDs across delta events.
 */
export interface EventToMessageMapper {
  /** Map a single event to 0 or 1 messages. Returns undefined for events that don't produce messages. */
  map(event: AgentEvent): MessageLike | undefined
  /** Reset mapper state (e.g. between sessions). */
  reset(): void
}

export interface EventToMessageMapperOptions {
  readonly sessionId: string
  readonly idGenerator?: () => string
}

let globalCounter = 0

function defaultIdGenerator(): string {
  globalCounter++
  return `kernel_${Date.now()}_${globalCounter}`
}

export function createEventToMessageMapper(
  options: EventToMessageMapperOptions,
): EventToMessageMapper {
  const { sessionId } = options
  const generateId = options.idGenerator ?? defaultIdGenerator

  let currentTextId: string | undefined
  let currentThinkingId: string | undefined
  let currentTextContent = ''
  let currentThinkingContent = ''
  // Track tool_call_start ID by toolCallId so tool_call_args can update the same message
  const toolCallMessageIds = new Map<string, string>()

  function makeTimestamp(): number {
    return Date.now()
  }

  function reset(): void {
    currentTextId = undefined
    currentThinkingId = undefined
    currentTextContent = ''
    currentThinkingContent = ''
    toolCallMessageIds.clear()
  }

  function map(event: AgentEvent): MessageLike | undefined {
    switch (event.type) {
      case 'text_start': {
        currentTextId = generateId()
        currentTextContent = ''
        return undefined
      }

      case 'text_delta': {
        const id = currentTextId ?? generateId()
        if (!currentTextId) currentTextId = id
        currentTextContent += event.text
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'text',
          content: currentTextContent,
          timestamp: makeTimestamp(),
          isStreamDelta: true,
        }
      }

      case 'text_end': {
        const id = currentTextId ?? generateId()
        currentTextId = undefined
        const content = event.text
        currentTextContent = ''
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'text',
          content,
          timestamp: makeTimestamp(),
        }
      }

      case 'thinking_start': {
        currentThinkingId = generateId()
        currentThinkingContent = ''
        return undefined
      }

      case 'thinking_delta': {
        const id = currentThinkingId ?? generateId()
        if (!currentThinkingId) currentThinkingId = id
        currentThinkingContent += event.text
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'thinking',
          content: currentThinkingContent,
          timestamp: makeTimestamp(),
          isStreamDelta: true,
        }
      }

      case 'thinking_end': {
        const id = currentThinkingId ?? generateId()
        currentThinkingId = undefined
        const content = event.text
        currentThinkingContent = ''
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'thinking',
          content,
          timestamp: makeTimestamp(),
        }
      }

      case 'tool_call_start': {
        const id = generateId()
        toolCallMessageIds.set(event.toolCallId, id)
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'tool_use',
          content: '',
          timestamp: makeTimestamp(),
          toolName: event.toolName,
          toolUseId: event.toolCallId,
        }
      }

      case 'tool_call_args': {
        // Reuse the same message ID from tool_call_start so the frontend updates in-place
        const id = toolCallMessageIds.get(event.toolCallId) ?? generateId()
        return {
          id,
          sessionId,
          role: 'assistant',
          type: 'tool_use',
          content: '',
          timestamp: makeTimestamp(),
          toolUseId: event.toolCallId,
          toolInput: event.args,
          isStreamDelta: true,
        }
      }

      case 'tool_result': {
        return {
          id: generateId(),
          sessionId,
          role: 'tool',
          type: 'tool_result',
          content: event.result,
          timestamp: makeTimestamp(),
          toolName: event.toolName,
          toolUseId: event.toolCallId,
          toolResult: event.result,
          success: !event.isError,
        }
      }

      case 'step_end': {
        const usage: TokenUsageLike = {
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          ...(event.usage.cacheReadTokens !== undefined ? { cacheReadTokens: event.usage.cacheReadTokens } : {}),
          ...(event.usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: event.usage.cacheWriteTokens } : {}),
        }
        return {
          id: generateId(),
          sessionId,
          role: 'system',
          type: 'usage',
          content: '',
          timestamp: makeTimestamp(),
          usage,
        }
      }

      case 'error': {
        return {
          id: generateId(),
          sessionId,
          role: 'system',
          type: 'error',
          content: event.error,
          timestamp: makeTimestamp(),
        }
      }

      case 'child_events': {
        // Handled by KernelService, not the mapper
        return undefined
      }

      case 'done': {
        // Don't emit a usage message — step_end already emits per-step usage.
        // Emitting totalUsage here would cause double-counting in the frontend.
        return undefined
      }
    }
  }

  return { map, reset }
}
