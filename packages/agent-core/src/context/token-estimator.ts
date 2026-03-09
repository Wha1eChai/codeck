import type { CoreMessage } from 'ai'

/**
 * Rough token estimate: ~4 chars per token for English/code, ~2 chars for CJK.
 * Good enough for budget management; exact count comes from API response.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0

  let cjkChars = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
      (code >= 0x3040 && code <= 0x30ff) ||   // Hiragana + Katakana
      (code >= 0xac00 && code <= 0xd7af)      // Hangul
    ) {
      cjkChars++
    }
  }

  const nonCjkChars = text.length - cjkChars
  return Math.ceil(nonCjkChars / 4) + Math.ceil(cjkChars / 2)
}

/** Per-message overhead: role tokens + structural tokens (~4 tokens). */
const MESSAGE_OVERHEAD = 4

function extractTextFromContent(content: CoreMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part)
    } else if ('text' in part && typeof part.text === 'string') {
      parts.push(part.text)
    } else if ('result' in part && typeof part.result === 'string') {
      parts.push(part.result)
    } else if ('args' in part) {
      parts.push(JSON.stringify(part.args))
    }
  }
  return parts.join('')
}

export function estimateMessageTokens(message: CoreMessage): number {
  const text = extractTextFromContent(message.content)
  return estimateTokens(text) + MESSAGE_OVERHEAD
}

export function estimateMessagesTokens(messages: readonly CoreMessage[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateMessageTokens(msg)
  }
  return total
}
