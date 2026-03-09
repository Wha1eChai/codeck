import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateMessageTokens, estimateMessagesTokens } from '../token-estimator.js'
import type { CoreMessage } from 'ai'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates ~4 chars per token for ASCII text', () => {
    const text = 'Hello world' // 11 chars → ceil(11/4) = 3
    expect(estimateTokens(text)).toBe(3)
  })

  it('estimates ~2 chars per token for CJK text', () => {
    const text = '你好世界' // 4 CJK chars → ceil(4/2) = 2
    expect(estimateTokens(text)).toBe(2)
  })

  it('handles mixed ASCII and CJK', () => {
    const text = 'Hello你好' // 5 ASCII + 2 CJK → ceil(5/4) + ceil(2/2) = 2 + 1 = 3
    expect(estimateTokens(text)).toBe(3)
  })

  it('handles long English text', () => {
    const text = 'a'.repeat(1000) // 1000 chars → ceil(1000/4) = 250
    expect(estimateTokens(text)).toBe(250)
  })

  it('handles Japanese hiragana/katakana as CJK', () => {
    const text = 'こんにちは' // 5 hiragana → ceil(5/2) = 3
    expect(estimateTokens(text)).toBe(3)
  })

  it('handles Korean hangul as CJK', () => {
    const text = '안녕하세요' // 5 hangul → ceil(5/2) = 3
    expect(estimateTokens(text)).toBe(3)
  })
})

describe('estimateMessageTokens', () => {
  it('estimates user text message with overhead', () => {
    const msg: CoreMessage = { role: 'user', content: 'Hello world' }
    // ceil(11/4) + 4 overhead = 3 + 4 = 7
    expect(estimateMessageTokens(msg)).toBe(7)
  })

  it('handles assistant message with content array', () => {
    const msg: CoreMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world' }],
    }
    expect(estimateMessageTokens(msg)).toBe(7)
  })

  it('handles tool message with result', () => {
    const msg: CoreMessage = {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'tc_1', toolName: 'Read', result: 'file contents here' }],
    }
    // 'file contents here' = 18 chars → ceil(18/4) + 4 = 5 + 4 = 9
    expect(estimateMessageTokens(msg)).toBe(9)
  })

  it('handles assistant tool-call with args', () => {
    const msg: CoreMessage = {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: 'tc_1', toolName: 'Bash', args: { command: 'ls -la' } },
      ],
    }
    // JSON.stringify({command: 'ls -la'}) = '{"command":"ls -la"}' = 20 chars → ceil(20/4) + 4 = 5 + 4 = 9
    expect(estimateMessageTokens(msg)).toBe(9)
  })
})

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })

  it('sums token estimates across messages', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'Hello world' },     // 7
      { role: 'assistant', content: 'Hi there!' },   // ceil(9/4) + 4 = 3 + 4 = 7
    ]
    expect(estimateMessagesTokens(messages)).toBe(14)
  })
})
