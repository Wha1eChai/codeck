import { useMemo } from 'react'
import { useMessageStore } from '../stores/message-store'
import { Message, TokenUsage } from '@common/types'

const EMPTY_MESSAGES: Message[] = []

export function useTokenUsage(sessionId: string | null) {
  const messages = useMessageStore(s => sessionId ? s.messages[sessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)

  const usage = useMemo(() => {
    return messages.reduce((acc, msg) => {
      if (msg.type === 'usage' && msg.usage) {
        return {
          inputTokens: acc.inputTokens + msg.usage.inputTokens,
          outputTokens: acc.outputTokens + msg.usage.outputTokens,
          cacheReadTokens: acc.cacheReadTokens + (msg.usage.cacheReadTokens || 0),
          cacheWriteTokens: acc.cacheWriteTokens + (msg.usage.cacheWriteTokens || 0),
          costUsd: msg.usage.costUsd !== undefined ? (acc.costUsd ?? 0) + msg.usage.costUsd : acc.costUsd,
          numTurns: acc.numTurns + (msg.usage.numTurns || 0),
          durationMs: acc.durationMs + (msg.usage.durationMs || 0),
        }
      }
      return acc
    }, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: undefined as number | undefined,
      numTurns: 0,
      durationMs: 0,
    })
  }, [messages])

  return usage
}
