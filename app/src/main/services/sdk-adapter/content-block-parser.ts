// ============================================================
// Content Block Parser — SDK content block → Message[] fan-out
// ============================================================

import type { Message, TokenUsage } from '@common/types'
import type { SDKContentBlock, SDKUsage } from './sdk-types'

/**
 * Parse an array of SDK content blocks into a flat list of internal Messages.
 * One SDK assistant message may contain multiple content blocks (thinking, text,
 * tool_use), each of which becomes a separate Message for the renderer.
 */
export function parseContentBlocks(
  blocks: readonly SDKContentBlock[],
  sessionId: string,
  parentUuid: string,
  parentToolUseId?: string,
): readonly Message[] {
  const messages: Message[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const id = `${parentUuid}_block_${i}`
    const timestamp = Date.now()

    switch (block.type) {
      case 'text': {
        const b = block as { type: 'text'; text: string }

        // Detect API error responses disguised as text content
        if (looksLikeApiError(b.text)) {
          messages.push({
            id,
            sessionId,
            role: 'system',
            type: 'error',
            content: b.text,
            timestamp,
            ...(parentToolUseId ? { parentToolUseId } : {}),
          })
        } else {
          messages.push({
            id,
            sessionId,
            role: 'assistant',
            type: 'text',
            content: b.text,
            timestamp,
            ...(parentToolUseId ? { parentToolUseId } : {}),
          })
        }
        break
      }

      case 'thinking': {
        const b = block as { type: 'thinking'; thinking: string }
        messages.push({
          id,
          sessionId,
          role: 'assistant',
          type: 'thinking',
          content: b.thinking,
          timestamp,
          ...(parentToolUseId ? { parentToolUseId } : {}),
        })
        break
      }

      case 'tool_use': {
        const b = block as {
          type: 'tool_use'
          id: string
          name: string
          input: Record<string, unknown>
        }
        messages.push({
          id,
          sessionId,
          role: 'assistant',
          type: 'tool_use',
          content: '',
          toolName: b.name,
          toolInput: b.input,
          toolUseId: b.id,
          timestamp,
          ...(parentToolUseId ? { parentToolUseId } : {}),
        })
        break
      }

      case 'tool_result': {
        const b = block as {
          type: 'tool_result'
          tool_use_id: string
          content: unknown
          is_error?: boolean
        }
        const normalizedContent = normalizeContent(b.content)
        messages.push({
          id,
          sessionId,
          role: 'tool',
          type: 'tool_result',
          content: normalizedContent,
          toolResult: normalizedContent,
          toolUseId: b.tool_use_id,
          success: !b.is_error,
          timestamp,
          ...(parentToolUseId ? { parentToolUseId } : {}),
        })
        break
      }

      default: {
        messages.push({
          id,
          sessionId,
          role: 'assistant',
          type: 'text',
          content: `[Unknown content block: ${block.type}]`,
          timestamp,
          ...(parentToolUseId ? { parentToolUseId } : {}),
        })
        break
      }
    }
  }

  return messages
}

/**
 * Convert SDK usage object to our internal TokenUsage shape.
 */
export function mapUsage(sdkUsage: SDKUsage | undefined): TokenUsage | undefined {
  if (!sdkUsage) return undefined

  return {
    inputTokens: sdkUsage.input_tokens,
    outputTokens: sdkUsage.output_tokens,
    cacheReadTokens: sdkUsage.cache_read_input_tokens,
    cacheWriteTokens: sdkUsage.cache_creation_input_tokens,
  }
}

// -- Helpers -----------------------------------------------------------------

/**
 * Normalize SDK content to a plain string.
 *
 * SDK content fields (especially tool_result.content) can arrive as:
 * - A string (pass through)
 * - An array of content blocks: [{type: "text", text: "..."}, ...]
 * - A single content block object: {type: "text", text: "..."}
 * - null/undefined (empty string)
 */
export function normalizeContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw == null) return ''

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') {
          return item.text
        }
        return JSON.stringify(item)
      })
      .join('')
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if ('text' in obj && typeof obj.text === 'string') return obj.text
    return JSON.stringify(raw)
  }

  return String(raw)
}

/**
 * Detects API/HTTP error text that arrives as assistant text content.
 *
 * Ideally errors would be classified upstream by the SDK, but some API
 * proxies (e.g. OpenRouter, custom gateways) format HTTP errors as text
 * content blocks before the process exits.  We detect common patterns
 * here as a safety net.
 *
 * Detection strategy:
 *  - RFC 7231 status codes: 4xx (client error) and 5xx (server error)
 *  - Common error envelope formats (JSON `{"error":...}`)
 */
function looksLikeApiError(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // 1. Starts with "API Error: <4xx|5xx>" or "Error: <4xx|5xx>" (case-insensitive)
  if (/^(api\s+)?error:\s*[45]\d{2}\b/i.test(trimmed)) return true

  // 2. Starts with "HTTP <4xx|5xx>"
  if (/^https?\s+[45]\d{2}\b/i.test(trimmed)) return true

  // 3. Raw JSON error envelope: {"error": ...} or {"errors": ...}
  if (/^\{"errors?"[\s:]/i.test(trimmed)) return true

  return false
}


