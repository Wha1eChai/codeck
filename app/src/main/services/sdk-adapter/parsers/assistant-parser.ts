// ============================================================
// Assistant Parser — SDK assistant message → ParseResult
// ============================================================

import crypto from 'crypto'
import type { SDKContentBlock } from '../sdk-types'
import { parseContentBlocks, mapUsage } from '../content-block-parser'
import { rememberToolUse } from '../parse-helpers'
import type { StreamParseState } from '../stream-state'
import type { ParseResult } from '../message-parser'

export function parseAssistant(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const betaMessage = msg.message as Record<string, unknown> | undefined
  const parentToolUseId = typeof msg.parent_tool_use_id === 'string' ? msg.parent_tool_use_id : undefined

  if (!betaMessage) {
    return { messages: [] }
  }

  // P1: SDK-level error classification (authentication_failed, rate_limit, etc.)
  const assistantError = msg.error as string | undefined
  if (assistantError) {
    const errorLabels: Record<string, string> = {
      authentication_failed: 'Authentication failed',
      billing_error: 'Billing error',
      rate_limit: 'Rate limit exceeded',
      invalid_request: 'Invalid request',
      server_error: 'Server error',
      max_output_tokens: 'Max output tokens reached',
      unknown: 'Unknown error',
    }
    const label = errorLabels[assistantError] ?? assistantError
    // Still parse content blocks — the assistant may have partial output before the error
    const blocks = (betaMessage.content as readonly SDKContentBlock[]) ?? []
    const contentMessages = parseContentBlocks(blocks, sessionId, uuid, parentToolUseId)
    return {
      messages: [
        ...contentMessages,
        {
          id: `${uuid}_error`,
          sessionId,
          role: 'system' as const,
          type: 'error' as const,
          content: label,
          timestamp: Date.now(),
        },
      ],
    }
  }

  const blocks = (betaMessage.content as readonly SDKContentBlock[]) ?? []
  const messages = parseContentBlocks(blocks, sessionId, uuid, parentToolUseId)

  const sdkUsage = betaMessage.usage as Record<string, unknown> | undefined
  const usage = mapUsage(
    sdkUsage
      ? {
        input_tokens: (sdkUsage.input_tokens as number) ?? 0,
        output_tokens: (sdkUsage.output_tokens as number) ?? 0,
        cache_read_input_tokens: sdkUsage.cache_read_input_tokens as number | undefined,
        cache_creation_input_tokens: sdkUsage.cache_creation_input_tokens as number | undefined,
      }
      : undefined,
  )

  if (usage && messages.length > 0) {
    const lastIdx = messages.length - 1
    const enriched = [...messages]
    enriched[lastIdx] = { ...enriched[lastIdx], usage }
    return { messages: enriched }
  }

  return { messages }
}

export function parseAssistantWithStreamAwareness(
  msg: Record<string, unknown>,
  sessionId: string,
  streamState: StreamParseState,
): ParseResult {
  const betaMessage = msg.message as Record<string, unknown> | undefined
  const assistantMessageId = betaMessage?.id

  const contentBlocks = Array.isArray(betaMessage?.content)
    ? (betaMessage?.content as readonly Record<string, unknown>[])
    : []
  for (const block of contentBlocks) {
    if (block.type === 'tool_use') {
      rememberToolUse(
        streamState,
        typeof block.id === 'string' ? block.id : undefined,
        typeof block.name === 'string' ? block.name : undefined,
      )
    }
  }

  if (typeof assistantMessageId === 'string' && streamState.streamedMessageIds.has(assistantMessageId)) {
    // stream_event already emitted stable blocks for this assistant message.
    return { messages: [] }
  }

  return parseAssistant(msg, sessionId)
}
