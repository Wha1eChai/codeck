// ============================================================
// Parse Helpers — shared utilities for message parsers
// ============================================================

import type { Message } from '@common/types'
import type { StreamParseState } from './stream-state'

export function readEventIndex(event: Record<string, unknown>): number | null {
  const index = event.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    return null
  }
  return index
}

export function buildStreamBlockMessageId(streamMessageId: string, index: number): string {
  return `${streamMessageId}_block_${index}`
}

export function buildAssistantStreamMessage(input: {
  id: string
  sessionId: string
  type: 'text' | 'thinking'
  content: string
  isStreamDelta: boolean
}): Message {
  return {
    id: input.id,
    sessionId: input.sessionId,
    role: 'assistant',
    type: input.type,
    content: input.content,
    isStreamDelta: input.isStreamDelta,
    timestamp: Date.now(),
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseToolUseInput(
  base: Record<string, unknown>,
  partialInputJson: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }

  if (!partialInputJson) {
    return merged
  }

  try {
    const parsed = JSON.parse(partialInputJson)
    if (isRecord(parsed)) {
      return { ...merged, ...parsed }
    }
    return { ...merged, _raw: partialInputJson }
  } catch {
    return { ...merged, _raw: partialInputJson }
  }
}

export function rememberToolUse(
  state: StreamParseState,
  toolUseId: string | undefined,
  toolName: string | undefined,
): void {
  if (!toolUseId || !toolName) return
  state.toolUseNames.set(toolUseId, toolName)
}
