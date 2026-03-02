import { SUBAGENT_TOOL_NAMES } from './constants.js'
import type { ParsedMessage } from './types.js'

export interface SubagentInfo {
  /** toolUseId from the Task/dispatch_agent tool_use message */
  toolUseId: string
  /** sessionId of the parent session */
  parentSessionId: string
  /** tool name (Task, dispatch_agent, etc.) */
  toolName: string
  /** Prompt extracted from tool input */
  triggerPrompt?: string
  /** agentId if present in progress data */
  agentId?: string
  /** Number of tool calls (agent_progress events) */
  progressEventCount: number
}

/**
 * Find all subagent invocations in a session's messages.
 */
export function findSubagentInvocations(messages: ParsedMessage[]): SubagentInfo[] {
  const subagents = new Map<string, SubagentInfo>()

  for (const msg of messages) {
    // Detect Task/dispatch_agent tool_use
    if (
      msg.type === 'tool_use' &&
      msg.toolName &&
      SUBAGENT_TOOL_NAMES.has(msg.toolName) &&
      msg.toolUseId
    ) {
      const prompt = extractPromptFromInput(msg.toolInput)
      subagents.set(msg.toolUseId, {
        toolUseId: msg.toolUseId,
        parentSessionId: msg.sessionId,
        toolName: msg.toolName,
        triggerPrompt: prompt,
        progressEventCount: 0,
      })
    }

    // Count agent_progress events and link agentId
    if (msg.type === 'progress' && msg.progressType === 'agent_progress' && msg.toolUseId) {
      const info = subagents.get(msg.toolUseId)
      if (info) {
        subagents.set(msg.toolUseId, {
          ...info,
          progressEventCount: info.progressEventCount + 1,
          // Capture agentId from first agent_progress event if not already set
          agentId: info.agentId ?? msg.agentId,
        })
      }
    }
  }

  return Array.from(subagents.values())
}

function extractPromptFromInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined

  // Common prompt field names in Claude Code tool inputs
  const promptFields = ['prompt', 'description', 'task', 'message', 'content']
  for (const field of promptFields) {
    const value = input[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 500)
    }
  }
  return undefined
}

/**
 * Count the number of subagent invocations in a session.
 */
export function countSubagents(messages: ParsedMessage[]): number {
  return messages.filter(
    (m) => m.type === 'tool_use' && m.toolName && SUBAGENT_TOOL_NAMES.has(m.toolName),
  ).length
}
