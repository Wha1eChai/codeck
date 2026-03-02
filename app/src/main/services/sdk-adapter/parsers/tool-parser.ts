// ============================================================
// Tool Parser — SDK tool_progress / tool_use_summary → ParseResult
// ============================================================

import crypto from 'crypto'
import type { ParseResult } from '../message-parser'

export function parseToolProgress(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const toolName = (msg.tool_name as string) ?? ''
  const elapsed = msg.elapsed_time_seconds as number | undefined
  const progressText = elapsed !== undefined ? `Running... ${elapsed.toFixed(1)}s` : 'Running...'

  return {
    messages: [
      {
        id: (msg.uuid as string) ?? crypto.randomUUID(),
        sessionId,
        role: 'tool',
        type: 'tool_progress',
        content: progressText,
        toolName,
        toolUseId: msg.tool_use_id as string | undefined,
        timestamp: Date.now(),
      },
    ],
  }
}

export function parseToolUseSummary(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const summary = (msg.summary as string) ?? ''
  if (!summary) return { messages: [] }

  return {
    messages: [
      {
        id: (msg.uuid as string) ?? crypto.randomUUID(),
        sessionId,
        role: 'system',
        type: 'text',
        content: summary,
        timestamp: Date.now(),
      },
    ],
  }
}
