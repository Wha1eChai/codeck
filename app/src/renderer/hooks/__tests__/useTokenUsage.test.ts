// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTokenUsage } from '../useTokenUsage'
import { useMessageStore } from '../../stores/message-store'
import type { Message } from '@common/types'

const SESSION_ID = 'sess-1'

function makeUsageMessage(overrides?: Partial<Message>): Message {
  return {
    id: overrides?.id ?? `usage-${Date.now()}`,
    sessionId: SESSION_ID,
    role: 'system',
    type: 'usage',
    content: '',
    timestamp: Date.now(),
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      costUsd: 0.01,
      numTurns: 1,
      durationMs: 500,
    },
    ...overrides,
  }
}

describe('useTokenUsage', () => {
  beforeEach(() => {
    useMessageStore.setState({ messages: {} })
  })

  it('returns zero usage when no messages', () => {
    const { result } = renderHook(() => useTokenUsage(SESSION_ID))
    expect(result.current.inputTokens).toBe(0)
    expect(result.current.outputTokens).toBe(0)
  })

  it('returns zero usage when sessionId is null', () => {
    const { result } = renderHook(() => useTokenUsage(null))
    expect(result.current.inputTokens).toBe(0)
  })

  it('aggregates usage from multiple messages', () => {
    useMessageStore.setState({
      messages: {
        [SESSION_ID]: [
          makeUsageMessage({ id: 'u1', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, costUsd: 0.01, numTurns: 1, durationMs: 500 } }),
          makeUsageMessage({ id: 'u2', usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 10, costUsd: 0.02, numTurns: 2, durationMs: 1000 } }),
        ],
      },
    })

    const { result } = renderHook(() => useTokenUsage(SESSION_ID))
    expect(result.current.inputTokens).toBe(300)
    expect(result.current.outputTokens).toBe(150)
    expect(result.current.cacheReadTokens).toBe(30)
    expect(result.current.cacheWriteTokens).toBe(15)
    expect(result.current.costUsd).toBeCloseTo(0.03)
    expect(result.current.numTurns).toBe(3)
    expect(result.current.durationMs).toBe(1500)
  })

  it('ignores non-usage messages', () => {
    useMessageStore.setState({
      messages: {
        [SESSION_ID]: [
          { id: 'text-1', sessionId: SESSION_ID, role: 'assistant', type: 'text', content: 'Hello', timestamp: Date.now() },
          makeUsageMessage({ id: 'u1', usage: { inputTokens: 100, outputTokens: 50 } }),
        ],
      },
    })

    const { result } = renderHook(() => useTokenUsage(SESSION_ID))
    expect(result.current.inputTokens).toBe(100)
  })
})
