import { MAX_TOOL_INPUT_JSON, MAX_TOOL_OUTPUT_TEXT } from './constants.js'
import type { ParsedMessage, ToolCall } from './types.js'

export interface ToolPairResult {
  paired: ToolCall[]
  unpairedUses: ParsedMessage[]
  unpairedResults: ParsedMessage[]
}

/**
 * Pair tool_use messages with their corresponding tool_result messages.
 * Returns paired calls plus any unmatched entries.
 */
export function pairToolCalls(messages: ParsedMessage[]): ToolPairResult {
  const useByToolUseId = new Map<string, ParsedMessage>()
  const resultByToolUseId = new Map<string, ParsedMessage>()

  for (const msg of messages) {
    if (msg.type === 'tool_use' && msg.toolUseId) {
      useByToolUseId.set(msg.toolUseId, msg)
    } else if (msg.type === 'tool_result' && msg.toolUseId) {
      resultByToolUseId.set(msg.toolUseId, msg)
    }
  }

  const paired: ToolCall[] = []
  const pairedIds = new Set<string>()

  for (const [toolUseId, useMsg] of useByToolUseId) {
    const resultMsg = resultByToolUseId.get(toolUseId)
    if (!resultMsg) continue

    pairedIds.add(toolUseId)

    const inputJson = JSON.stringify(useMsg.toolInput ?? {})
    const outputText = resultMsg.toolResultContent ?? ''

    paired.push({
      toolUseId,
      sessionId: useMsg.sessionId,
      toolName: useMsg.toolName ?? 'unknown',
      inputJson: inputJson.slice(0, MAX_TOOL_INPUT_JSON),
      outputText: outputText.slice(0, MAX_TOOL_OUTPUT_TEXT),
      success: !(resultMsg.isError ?? false),
      lineNumber: useMsg.lineNumber,
    })
  }

  const unpairedUses = Array.from(useByToolUseId.values()).filter(
    (m) => m.toolUseId && !pairedIds.has(m.toolUseId),
  )
  const unpairedResults = Array.from(resultByToolUseId.values()).filter(
    (m) => m.toolUseId && !pairedIds.has(m.toolUseId),
  )

  return { paired, unpairedUses, unpairedResults }
}

/**
 * Get tool usage statistics from paired calls.
 */
export function getToolStats(calls: ToolCall[]): Record<string, ToolStat> {
  const stats: Record<string, ToolStat> = {}

  for (const call of calls) {
    if (!stats[call.toolName]) {
      stats[call.toolName] = {
        toolName: call.toolName,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
      }
    }

    const stat = stats[call.toolName]!
    stat.totalCalls++
    if (call.success) stat.successCount++
    else stat.failureCount++
  }

  return stats
}

export interface ToolStat {
  toolName: string
  totalCalls: number
  successCount: number
  failureCount: number
}
