// ============================================================
// User Parser — SDK user message → ParseResult
// ============================================================

import crypto from 'crypto'
import type { Message } from '@common/types'
import { normalizeContent } from '../content-block-parser'
import type { ParseResult } from '../message-parser'

export type ToolNameResolver = (toolUseId: string | undefined) => string | undefined

export function parseUser(
  msg: Record<string, unknown>,
  sessionId: string,
  resolveToolName?: ToolNameResolver,
  includeUserMessages = false,
): ParseResult {
  // P1: Filter replay messages during session resume to avoid duplicate rendering
  if (msg.isReplay === true) {
    return { messages: [] }
  }

  const uuid = (msg.uuid as string) ?? crypto.randomUUID()
  const inner = msg.message as Record<string, unknown> | undefined
  const rawContent = inner?.content
  const toolUseResult = msg.tool_use_result as Record<string, unknown> | undefined

  // SDK user messages come in two forms:
  // 1. Plain text content (actual user input)
  // 2. tool_result array (automatic tool execution results)
  if (Array.isArray(rawContent)) {
    const blocks = rawContent as readonly Record<string, unknown>[]
    const hasToolResult = blocks.some((b) => b.type === 'tool_result')

    if (hasToolResult) {
      const messages: Message[] = blocks
        .filter((b) => b.type === 'tool_result')
        .map((b, i) => {
          const toolUseId = b.tool_use_id as string | undefined
          const isError = b.is_error === true
          const blockContent = normalizeContent(b.content)

          let resultContent = blockContent
          if (toolUseResult) {
            const stdout = toolUseResult.stdout as string | undefined
            const file = toolUseResult.file as Record<string, unknown> | undefined
            if (file?.content) {
              resultContent = file.content as string
            } else if (stdout !== undefined) {
              resultContent = stdout.replace(/\r$/g, '')
            }
          }

          return {
            id: `${uuid}_tool_result_${i}`,
            sessionId,
            role: 'tool' as const,
            type: 'tool_result' as const,
            content: resultContent,
            toolResult: resultContent,
            toolName: resolveToolName?.(toolUseId),
            toolUseId,
            success: !isError,
            timestamp: Date.now(),
          }
        })

      return { messages }
    }

    if (includeUserMessages) {
      const textContent = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n')
        .trim()

      if (textContent) {
        return {
          messages: [
            {
              id: uuid,
              sessionId,
              role: 'user',
              type: 'text',
              content: textContent,
              userSubtype: classifyUserContent(textContent),
              timestamp: Date.now(),
            },
          ],
        }
      }
    }

    // User prompt echoes are rendered optimistically by the renderer in live mode.
    return { messages: [] }
  }

  if (includeUserMessages && typeof rawContent === 'string' && rawContent.trim()) {
    return {
      messages: [
        {
          id: uuid,
          sessionId,
          role: 'user',
          type: 'text',
          content: rawContent,
          userSubtype: classifyUserContent(rawContent),
          timestamp: Date.now(),
        },
      ],
    }
  }

  // Plain string user input is handled optimistically by renderer in live mode.
  if (typeof rawContent === 'string') {
    return { messages: [] }
  }

  return { messages: [] }
}

function classifyUserContent(content: string): Message['userSubtype'] {
  if (content.includes('[Request interrupted by user]')) return 'interrupted'
  if (content.includes('<system-reminder>')) return 'hidden'
  if (
    content.startsWith('<command-message>') ||
    content.startsWith('<command-name>') ||
    content.startsWith('Base directory for this skill:')
  ) return 'system-injection'
  return 'real'
}
