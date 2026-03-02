// ============================================================
// Result Parser — SDK result message → ParseResult
// ============================================================

import crypto from 'crypto'
import { mapUsage } from '../content-block-parser'
import type { ParseResult } from '../message-parser'

export function parseResult(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const isError =
    msg.is_error === true ||
    (typeof msg.subtype === 'string' && msg.subtype.startsWith('error'))

  if (isError) {
    const errors = msg.errors as readonly string[] | undefined
    const errorText = (msg.error as string) ?? errors?.join('; ') ?? ''

    // Generate a human-readable fallback from the subtype when no explicit error text
    const subtypeFallbacks: Record<string, string> = {
      error_max_turns: 'Maximum conversation turns reached.',
      error_max_budget_usd: 'Budget limit exceeded.',
      error_during_execution: 'Error during execution.',
      error_max_structured_output_retries: 'Structured output retries exhausted.',
    }
    const finalErrorText = errorText || subtypeFallbacks[msg.subtype as string] || ''

    if (!finalErrorText) {
      return { messages: [] }
    }

    return {
      messages: [
        {
          id: uuid,
          sessionId,
          role: 'system',
          type: 'error',
          content: finalErrorText,
          timestamp: Date.now(),
        },
      ],
    }
  }

  const sdkUsage = msg.usage as Record<string, unknown> | undefined
  const baseUsage = mapUsage(
    sdkUsage
      ? {
        input_tokens: (sdkUsage.input_tokens as number) ?? 0,
        output_tokens: (sdkUsage.output_tokens as number) ?? 0,
        cache_read_input_tokens: sdkUsage.cache_read_input_tokens as number | undefined,
        cache_creation_input_tokens: sdkUsage.cache_creation_input_tokens as number | undefined,
      }
      : undefined,
  )

  const costUsd = msg.total_cost_usd as number | undefined
  const numTurns = msg.num_turns as number | undefined
  const durationMs = msg.duration_ms as number | undefined

  const usage = baseUsage
    ? { ...baseUsage, costUsd, numTurns, durationMs }
    : costUsd !== undefined || numTurns !== undefined || durationMs !== undefined
      ? { inputTokens: 0, outputTokens: 0, costUsd, numTurns, durationMs }
      : undefined

  return {
    messages: [
      {
        id: uuid,
        sessionId,
        role: 'system',
        type: 'usage',
        content: '',
        usage,
        timestamp: Date.now(),
      },
    ],
  }
}
