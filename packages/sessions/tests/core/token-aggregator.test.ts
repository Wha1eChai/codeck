import { describe, it, expect } from 'vitest'
import { aggregateTokens, addUsage, EMPTY_USAGE } from '../../src/core/token-aggregator.js'
import type { ParsedMessage, ParsedUsage } from '../../src/core/types.js'

function makeAssistantMsg(usage: ParsedUsage, model = 'claude-sonnet-4-6'): ParsedMessage {
  return {
    uuid: crypto.randomUUID(),
    parentUuid: null,
    sessionId: 'test',
    type: 'text',
    role: 'assistant',
    timestamp: Date.now(),
    isSidechain: false,
    lineNumber: 1,
    usage,
    model,
  }
}

describe('aggregateTokens', () => {
  it('sums tokens across messages', () => {
    const messages: ParsedMessage[] = [
      makeAssistantMsg({ inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }),
      makeAssistantMsg({ inputTokens: 200, outputTokens: 80, cacheCreationInputTokens: 10, cacheReadInputTokens: 500 }),
    ]

    const agg = aggregateTokens(messages)
    expect(agg.totalInputTokens).toBe(300)
    expect(agg.totalOutputTokens).toBe(130)
    expect(agg.totalCacheCreationTokens).toBe(10)
    expect(agg.totalCacheReadTokens).toBe(500)
  })

  it('groups by model', () => {
    const messages: ParsedMessage[] = [
      makeAssistantMsg({ inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, 'claude-sonnet-4-6'),
      makeAssistantMsg({ inputTokens: 200, outputTokens: 80, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, 'claude-opus-4-6'),
    ]

    const agg = aggregateTokens(messages)
    expect(Object.keys(agg.byModel)).toHaveLength(2)
    expect(agg.byModel['claude-sonnet-4-6']?.inputTokens).toBe(100)
    expect(agg.byModel['claude-opus-4-6']?.inputTokens).toBe(200)
  })

  it('estimates cost > 0 for non-zero tokens', () => {
    const messages: ParsedMessage[] = [
      makeAssistantMsg({ inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }),
    ]
    const agg = aggregateTokens(messages)
    expect(agg.estimatedCostUsd).toBeGreaterThan(0)
  })

  it('returns zero for empty messages', () => {
    const agg = aggregateTokens([])
    expect(agg.totalInputTokens).toBe(0)
    expect(agg.estimatedCostUsd).toBe(0)
  })

  it('ignores non-assistant messages', () => {
    const messages: ParsedMessage[] = [
      {
        uuid: 'u1',
        parentUuid: null,
        sessionId: 'test',
        type: 'text',
        role: 'user',
        timestamp: Date.now(),
        isSidechain: false,
        lineNumber: 1,
        usage: { inputTokens: 999, outputTokens: 999, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      },
    ]
    const agg = aggregateTokens(messages)
    expect(agg.totalInputTokens).toBe(0)
  })
})

describe('addUsage', () => {
  it('adds usage immutably', () => {
    const a: ParsedUsage = { inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 1, cacheReadInputTokens: 2 }
    const b: ParsedUsage = { inputTokens: 20, outputTokens: 10, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 }
    const result = addUsage(a, b)
    expect(result.inputTokens).toBe(30)
    expect(result.outputTokens).toBe(15)
    // Original unchanged
    expect(a.inputTokens).toBe(10)
  })
})
