// ============================================================
// System Parser — SDK system message → ParseResult
// ============================================================

import crypto from 'crypto'
import type { SessionMetadata } from '../sdk-types'
import type { ParseResult } from '../message-parser'

export function parseSystem(msg: Record<string, unknown>, sessionId: string): ParseResult {
  const subtype = msg.subtype as string | undefined

  switch (subtype) {
    case 'init': {
      const metadata: SessionMetadata = {
        sessionId: (msg.session_id as string) ?? sessionId,
        model: msg.model as string | undefined,
        tools: msg.tools as readonly string[] | undefined,
        cwd: msg.cwd as string | undefined,
        permissionMode: (msg.permissionMode ?? msg.permission_mode) as string | undefined,
        claudeCodeVersion: msg.claude_code_version as string | undefined,
        apiKeySource: msg.apiKeySource as string | undefined,
        mcpServers: msg.mcp_servers as readonly unknown[] | undefined,
        slashCommands: msg.slash_commands as readonly string[] | undefined,
        agents: msg.agents as readonly string[] | undefined,
        skills: msg.skills as readonly string[] | undefined,
        fastModeState: msg.fast_mode_state as string | undefined,
      }
      return { messages: [], metadata }
    }

    case 'status': {
      const status = (msg.status as string | null) ?? null
      const text = status === 'compacting' ? 'Compacting conversation context...' : ''
      if (!text) return { messages: [] }
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: text,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'compact_boundary': {
      const compactMeta = msg.compact_metadata as Record<string, unknown> | undefined
      const trigger = compactMeta?.trigger as string | undefined
      const preTokens = compactMeta?.pre_tokens as number | undefined
      const parts: string[] = ['Session context compacted.']
      if (trigger) parts.push(`Trigger: ${trigger}.`)
      if (preTokens !== undefined) parts.push(`Pre-compact tokens: ~${preTokens.toLocaleString()}.`)
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'compact',
            content: parts.join(' '),
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_started': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: `[Hook: ${hookName}] Started`,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_progress': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      const output = (msg.output as string) ?? (msg.stdout as string) ?? ''
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: 'text',
            content: output ? `[Hook: ${hookName}] ${output}` : `[Hook: ${hookName}]`,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'hook_response': {
      const hookName = (msg.hook_name as string) ?? 'unknown'
      const outcome = (msg.outcome as string) ?? ''
      const output = (msg.output as string) ?? (msg.stdout as string) ?? ''
      const label = outcome === 'error' ? 'Failed' : outcome === 'cancelled' ? 'Cancelled' : 'Completed'
      const content = output ? `[Hook: ${hookName}] ${label}: ${output}` : `[Hook: ${hookName}] ${label}`
      return {
        messages: [
          {
            id: crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: outcome === 'error' ? 'error' : 'text',
            content,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'task_notification': {
      const taskStatus = (msg.status as string) ?? ''
      const summary = (msg.summary as string) ?? ''
      const taskId = (msg.task_id as string) ?? ''
      const label = taskStatus === 'failed' ? 'Task failed' : taskStatus === 'stopped' ? 'Task stopped' : 'Task completed'
      const content = summary ? `${label}: ${summary}` : `${label} (${taskId})`
      return {
        messages: [
          {
            id: (msg.uuid as string) ?? crypto.randomUUID(),
            sessionId,
            role: 'system',
            type: taskStatus === 'failed' ? 'error' : 'text',
            content,
            timestamp: Date.now(),
          },
        ],
      }
    }

    case 'files_persisted':
      return { messages: [] }

    default:
      return { messages: [] }
  }
}
