/**
 * CLI Message Parser — transforms CLI JSON-lines output into internal Message[].
 *
 * Follows the same fan-out pattern as sdk-adapter/message-parser.ts:
 * one CLI message may produce multiple internal Messages (e.g., assistant with
 * text + tool_use content blocks).
 */
import type { Message, TokenUsage } from '@common/types'
import type {
  CliMessage,
  CliContentBlock,
  CliParseResult,
  CliSessionMetadata,
} from './cli-message-types'

let idCounter = 0
function generateId(): string {
  return `cli_${Date.now()}_${++idCounter}`
}

function parseContentBlocks(
  blocks: readonly CliContentBlock[],
  sessionId: string,
): Message[] {
  const messages: Message[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) {
          messages.push({
            id: generateId(),
            sessionId,
            role: 'assistant',
            type: 'text',
            content: block.text,
            timestamp: Date.now(),
          })
        }
        break

      case 'thinking':
        if (block.thinking.length > 0) {
          messages.push({
            id: generateId(),
            sessionId,
            role: 'assistant',
            type: 'thinking',
            content: block.thinking,
            timestamp: Date.now(),
          })
        }
        break

      case 'tool_use':
        messages.push({
          id: generateId(),
          sessionId,
          role: 'assistant',
          type: 'tool_use',
          content: '',
          toolName: block.name,
          toolInput: block.input,
          toolUseId: block.id,
          timestamp: Date.now(),
        })
        break

      case 'tool_result':
        messages.push({
          id: generateId(),
          sessionId,
          role: 'tool',
          type: 'tool_result',
          content: block.content,
          toolUseId: block.tool_use_id,
          toolResult: block.content,
          success: !(block.is_error ?? false),
          timestamp: Date.now(),
        })
        break
    }
  }

  return messages
}

/**
 * Parse a single JSON-lines string from CLI stdout into Messages + metadata.
 * Returns null if the line is not valid JSON or an unknown message type.
 */
export function parseCliMessage(raw: string, sessionId: string): CliParseResult | null {
  let parsed: CliMessage
  try {
    parsed = JSON.parse(raw) as CliMessage
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
    return null
  }

  switch (parsed.type) {
    case 'assistant': {
      const messages = parseContentBlocks(parsed.message.content, sessionId)
      const metadata: CliSessionMetadata | undefined = parsed.session_id
        ? { sessionId: parsed.session_id }
        : undefined
      return { messages, metadata }
    }

    case 'user': {
      const content = typeof parsed.message.content === 'string'
        ? parsed.message.content
        : parsed.message.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('\n')

      if (content.length === 0) return { messages: [] }

      return {
        messages: [{
          id: generateId(),
          sessionId,
          role: 'user',
          type: 'text',
          content,
          timestamp: Date.now(),
        }],
      }
    }

    case 'result': {
      const usage: TokenUsage | undefined = parsed.usage
        ? {
            inputTokens: parsed.usage.input_tokens,
            outputTokens: parsed.usage.output_tokens,
            cacheReadTokens: parsed.usage.cache_read_input_tokens,
            cacheWriteTokens: parsed.usage.cache_creation_input_tokens,
            costUsd: parsed.cost_usd,
            durationMs: parsed.duration_ms,
          }
        : undefined

      const messages: Message[] = []

      // If there's a text result, emit it
      if (parsed.result && parsed.result.length > 0) {
        messages.push({
          id: generateId(),
          sessionId,
          role: 'assistant',
          type: 'text',
          content: parsed.result,
          timestamp: Date.now(),
        })
      }

      // Always emit usage message
      if (usage) {
        messages.push({
          id: generateId(),
          sessionId,
          role: 'system',
          type: 'usage',
          content: '',
          usage,
          timestamp: Date.now(),
        })
      }

      const isError = parsed.is_error ?? parsed.subtype.startsWith('error')
      if (isError && parsed.result) {
        messages.push({
          id: generateId(),
          sessionId,
          role: 'system',
          type: 'error',
          content: parsed.result,
          timestamp: Date.now(),
        })
      }

      return {
        messages,
        metadata: {
          sessionId: parsed.session_id,
          costUsd: parsed.total_cost_usd ?? parsed.cost_usd,
          usage: parsed.usage,
        },
        isDone: true,
      }
    }

    case 'system': {
      return {
        messages: [],
        metadata: {
          sessionId: parsed.session_id,
        },
      }
    }

    default:
      return null
  }
}
