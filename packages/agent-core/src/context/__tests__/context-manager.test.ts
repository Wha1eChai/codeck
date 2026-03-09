import { describe, it, expect } from 'vitest'
import type { CoreMessage } from 'ai'
import { compressToolResult, pruneMessages, createContextBudget } from '../context-manager.js'
import { estimateMessagesTokens } from '../token-estimator.js'

describe('compressToolResult', () => {
  it('returns short strings unchanged', () => {
    const result = 'short content'
    expect(compressToolResult(result)).toBe(result)
  })

  it('returns strings at maxChars unchanged', () => {
    const result = 'x'.repeat(8000)
    expect(compressToolResult(result)).toBe(result)
  })

  it('truncates strings exceeding maxChars', () => {
    const result = 'A'.repeat(5000) + 'B'.repeat(5000) // 10000 chars
    const compressed = compressToolResult(result, 8000)

    expect(compressed.length).toBeLessThan(result.length)
    expect(compressed).toContain('... [')
    expect(compressed).toContain('chars truncated]')
    // Head should be from the start
    expect(compressed.startsWith('A')).toBe(true)
    // Tail should be from the end
    expect(compressed.endsWith('B')).toBe(true)
  })

  it('respects custom maxChars', () => {
    const result = 'x'.repeat(200)
    const compressed = compressToolResult(result, 100)
    expect(compressed).toContain('chars truncated')
  })
})

describe('pruneMessages', () => {
  function makeUserMsg(text: string): CoreMessage {
    return { role: 'user', content: text }
  }

  function makeAssistantMsg(text: string): CoreMessage {
    return { role: 'assistant', content: text }
  }

  function makeToolMsg(result: string): CoreMessage {
    return {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'tc_1', toolName: 'Read', result }],
    }
  }

  const largeBudget = createContextBudget(200_000, 64_000, 'short system prompt')

  it('returns all messages when under budget', () => {
    const messages: CoreMessage[] = [
      makeUserMsg('Hello'),
      makeAssistantMsg('Hi there'),
    ]
    const result = pruneMessages(messages, largeBudget)
    expect(result).toHaveLength(2)
  })

  it('compresses large tool results even when under budget', () => {
    const hugeResult = 'x'.repeat(20000)
    const messages: CoreMessage[] = [
      makeUserMsg('Read a file'),
      makeToolMsg(hugeResult),
      makeAssistantMsg('Here are the contents'),
    ]
    const result = pruneMessages(messages, largeBudget)
    expect(result).toHaveLength(3)

    // Tool result should be compressed
    const toolMsg = result[1]!
    if (toolMsg.role === 'tool' && Array.isArray(toolMsg.content)) {
      const part = toolMsg.content[0] as { result: string }
      expect(part.result.length).toBeLessThan(hugeResult.length)
      expect(part.result).toContain('chars truncated')
    }
  })

  it('drops oldest middle messages when over budget', () => {
    // Create a very tight budget
    const tightBudget = createContextBudget(500, 100, 'sys') // ~400 available tokens - estimate('sys') ~ 1 token

    // Create many messages that exceed the budget
    const messages: CoreMessage[] = []
    for (let i = 0; i < 20; i++) {
      messages.push(makeUserMsg(`Message ${i} with some padding text to consume tokens`))
      messages.push(makeAssistantMsg(`Reply ${i} with additional content for token consumption`))
    }

    const result = pruneMessages(messages, tightBudget)

    // Should have fewer messages than input
    expect(result.length).toBeLessThan(messages.length)
    // Should keep the first message
    expect((result[0] as { content: string }).content).toBe(messages[0]!.content)
    // Should keep the last few messages
    const lastInput = messages[messages.length - 1]!
    const lastResult = result[result.length - 1]!
    expect(lastResult.content).toBe(lastInput.content)
  })

  it('always preserves first user message and last N messages', () => {
    // Budget that allows ~10 messages worth
    const mediumBudget = createContextBudget(1000, 200, 'prompt')

    const messages: CoreMessage[] = []
    for (let i = 0; i < 30; i++) {
      messages.push(makeUserMsg(`User message number ${i} with padding text here`))
      messages.push(makeAssistantMsg(`Assistant reply number ${i} with extra context`))
    }

    const result = pruneMessages(messages, mediumBudget)

    // First message preserved
    expect(result[0]!.content).toBe(messages[0]!.content)

    // Last 6 messages preserved (MIN_TAIL_MESSAGES = 6)
    const tail = result.slice(-6)
    const expectedTail = messages.slice(-6)
    for (let i = 0; i < 6; i++) {
      expect(tail[i]!.content).toBe(expectedTail[i]!.content)
    }
  })

  it('passes through when budget is misconfigured (available <= 0)', () => {
    const badBudget = createContextBudget(100, 200, 'very long system prompt')
    const messages: CoreMessage[] = [
      makeUserMsg('Hello'),
      makeAssistantMsg('World'),
    ]
    const result = pruneMessages(messages, badBudget)
    expect(result).toHaveLength(2)
  })

  it('handles empty message array', () => {
    expect(pruneMessages([], largeBudget)).toHaveLength(0)
  })

  it('handles single message', () => {
    const messages: CoreMessage[] = [makeUserMsg('Hello')]
    const result = pruneMessages(messages, largeBudget)
    expect(result).toHaveLength(1)
  })

  it('pruned result fits within budget', () => {
    const tightBudget = createContextBudget(800, 200, 'system')

    const messages: CoreMessage[] = []
    for (let i = 0; i < 50; i++) {
      messages.push(makeUserMsg(`Question ${i}: What is the meaning of life and everything?`))
      messages.push(makeAssistantMsg(`Answer ${i}: The meaning of life is a complex philosophical question.`))
    }

    const result = pruneMessages(messages, tightBudget)
    const resultTokens = estimateMessagesTokens(result)
    const available = 800 - 200 - Math.ceil('system'.length / 4)

    expect(resultTokens).toBeLessThanOrEqual(available)
  })
})
