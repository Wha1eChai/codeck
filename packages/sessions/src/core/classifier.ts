import {
  SKIP_TYPES,
  SYSTEM_MESSAGE_PREFIXES,
  SYSTEM_MESSAGE_EXACT,
  SUBAGENT_TOOL_NAMES,
} from './constants.js'
import type {
  RawJsonlEntry,
  RawContentBlock,
  RawUsage,
  ParsedMessage,
  ParsedUsage,
  ParsedFileSnapshot,
  MessageType,
  MessageRole,
  ProgressSubtype,
  SystemSubtype,
} from './types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTimestamp(entry: RawJsonlEntry): number {
  const ts = entry.timestamp
  if (typeof ts === 'number') return ts
  if (typeof ts === 'string') {
    const n = Date.parse(ts)
    if (!isNaN(n)) return n
  }
  return Date.now()
}

/** Extract text from a content value that may be string or content-block array */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content as RawContentBlock[]) {
      if (block.type === 'text') parts.push(block.text)
      else if (block.type === 'thinking') parts.push(block.thinking)
    }
    return parts.join('\n')
  }
  return ''
}

/**
 * Extract the first text string from a user message content (string or array).
 * Returns null if no text found.
 */
function extractFirstUserText(content: unknown): string | null {
  if (typeof content === 'string') {
    const t = content.trim()
    return t || null
  }
  if (Array.isArray(content)) {
    for (const block of content as RawContentBlock[]) {
      if (block.type === 'text' && block.text?.trim()) {
        return block.text
      }
    }
  }
  return null
}

/**
 * Check if a user-type entry is a system-injected message (not real user input).
 * Checks isMeta flag first, then content prefixes.
 * Adapted from history-service.ts isSystemMessage.
 */
export function isSystemMessage(entry: RawJsonlEntry): boolean {
  // Fast path: isMeta flag is definitive
  if (entry.isMeta === true) return true

  const msg = entry.message
  if (!msg || typeof msg !== 'object') return false

  const text = extractFirstUserText(msg.content)
  if (!text) return false

  if (SYSTEM_MESSAGE_EXACT.has(text.trim())) return true
  return SYSTEM_MESSAGE_PREFIXES.some((p) => text.startsWith(p))
}


function mapUsage(raw: RawUsage | undefined): ParsedUsage | undefined {
  if (!raw) return undefined
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheCreationInputTokens: raw.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? 0,
  }
}

function classifyProgressSubtype(raw: string): ProgressSubtype {
  switch (raw) {
    case 'bash_progress': return 'bash_progress'
    case 'hook_progress': return 'hook_progress'
    case 'agent_progress': return 'agent_progress'
    case 'waiting_for_task': return 'waiting_for_task'
    default: return 'unknown'
  }
}

function classifySystemSubtype(raw: string | undefined): SystemSubtype {
  switch (raw) {
    case 'turn_duration': return 'turn_duration'
    case 'compact_boundary': return 'compact_boundary'
    case 'microcompact_boundary': return 'microcompact_boundary'
    case 'stop_hook_summary': return 'stop_hook_summary'
    case 'api_error': return 'api_error'
    default: return 'unknown'
  }
}

// ─── Main Classifier ──────────────────────────────────────────────────────────

/**
 * Classify a raw JSONL entry into zero or more ParsedMessages.
 * Returns empty array for noise/metadata entries.
 */
export function classifyEntry(
  entry: RawJsonlEntry,
  lineNumber: number,
): ParsedMessage[] {
  const type = entry.type ?? ''
  const uuid = entry.uuid ?? ''
  const sessionId = entry.sessionId ?? ''
  const isSidechain = entry.isSidechain === true
  const isMeta = entry.isMeta === true
  const timestamp = extractTimestamp(entry)

  // Use logicalParentUuid for compact boundaries (parentUuid is null after compaction)
  const parentUuid = (entry.parentUuid as string | null | undefined)
    ?? (entry.logicalParentUuid as string | null | undefined)
    ?? null

  // Skip metadata/control rows
  if (SKIP_TYPES.has(type)) return []

  // ── User message ─────────────────────────────────────────────────────────
  if (type === 'user') {
    const msg = entry.message
    if (!msg || typeof msg !== 'object') return []

    const content = msg.content
    const messages: ParsedMessage[] = []

    // Determine if the entire message is system-injected
    const isSystem = isSystemMessage(entry)

    if (typeof content === 'string') {
      // String content — command messages, continuation notices, etc.
      messages.push({
        uuid,
        parentUuid,
        sessionId,
        type: 'text',
        role: isSystem || isMeta ? 'system' : 'user',
        timestamp,
        isSidechain,
        lineNumber,
        isMeta: isMeta || isSystem,
        text: content,
        gitBranch: typeof entry.gitBranch === 'string' ? entry.gitBranch : undefined,
        cwd: typeof entry.cwd === 'string' ? entry.cwd : undefined,
        version: typeof entry.version === 'string' ? entry.version : undefined,
        permissionMode: typeof entry.permissionMode === 'string' ? entry.permissionMode : undefined,
      })
      return messages
    }

    if (!Array.isArray(content)) return []

    for (const block of content as RawContentBlock[]) {
      if (block.type === 'text') {
        messages.push({
          uuid,
          parentUuid,
          sessionId,
          type: 'text',
          role: isSystem || isMeta ? 'system' : 'user',
          timestamp,
          isSidechain,
          lineNumber,
          isMeta: isMeta || isSystem,
          text: block.text,
          gitBranch: typeof entry.gitBranch === 'string' ? entry.gitBranch : undefined,
          cwd: typeof entry.cwd === 'string' ? entry.cwd : undefined,
          version: typeof entry.version === 'string' ? entry.version : undefined,
          permissionMode: typeof entry.permissionMode === 'string' ? entry.permissionMode : undefined,
          planContent: typeof entry.planContent === 'string' ? entry.planContent : undefined,
        })
      } else if (block.type === 'tool_result') {
        messages.push({
          uuid,
          parentUuid,
          sessionId,
          type: 'tool_result',
          role: 'tool',
          timestamp,
          isSidechain,
          lineNumber,
          toolUseId: block.tool_use_id,
          isError: block.is_error ?? false,
          toolResultContent: typeof block.content === 'string'
            ? block.content
            : extractText(block.content),
        })
      }
    }

    return messages
  }

  // ── Assistant message ─────────────────────────────────────────────────────
  if (type === 'assistant') {
    const msg = entry.message
    if (!msg || typeof msg !== 'object') return []

    const content = msg.content
    const model = typeof msg.model === 'string' ? msg.model : undefined
    const isFinal = msg.stop_reason != null
    const usage = mapUsage(msg.usage as RawUsage | undefined)

    if (!Array.isArray(content)) return []

    const messages: ParsedMessage[] = []

    for (const block of content as RawContentBlock[]) {
      if (block.type === 'text' && block.text) {
        messages.push({
          uuid,
          parentUuid,
          sessionId,
          type: 'text',
          role: 'assistant',
          timestamp,
          isSidechain,
          lineNumber,
          text: block.text,
          model,
          isFinalAssistant: isFinal,
        })
      } else if (block.type === 'thinking' && block.thinking) {
        messages.push({
          uuid,
          parentUuid,
          sessionId,
          type: 'thinking',
          role: 'assistant',
          timestamp,
          isSidechain,
          lineNumber,
          text: block.thinking,
          model,
        })
      } else if (block.type === 'tool_use') {
        const isSubagent = SUBAGENT_TOOL_NAMES.has(block.name)
        messages.push({
          uuid,
          parentUuid,
          sessionId,
          type: 'tool_use',
          role: 'assistant',
          timestamp,
          isSidechain: isSidechain || isSubagent,
          lineNumber,
          toolName: block.name,
          toolUseId: block.id,
          toolInput: block.input,
          model,
        })
      }
    }

    // Attach usage to the last message in the batch
    if (usage && messages.length > 0) {
      const last = messages[messages.length - 1]!
      messages[messages.length - 1] = { ...last, usage }
    }

    return messages
  }

  // ── System message ────────────────────────────────────────────────────────
  if (type === 'system') {
    const subtype = classifySystemSubtype(entry.subtype)

    // compact_boundary: context was automatically compacted
    if (subtype === 'compact_boundary') {
      const meta = entry.compactMetadata as { trigger?: string; preTokens?: number } | undefined
      return [{
        uuid,
        parentUuid,
        sessionId,
        type: 'compact',
        role: 'system',
        timestamp,
        isSidechain,
        lineNumber,
        systemSubtype: 'compact_boundary',
        text: typeof entry.content === 'string' ? entry.content : 'Conversation compacted',
        compactTrigger: meta?.trigger,
        compactPreTokens: meta?.preTokens,
      }]
    }

    // microcompact_boundary: selective tool output compaction
    if (subtype === 'microcompact_boundary') {
      const meta = entry.microcompactMetadata as {
        trigger?: string; preTokens?: number; tokensSaved?: number
      } | undefined
      return [{
        uuid,
        parentUuid,
        sessionId,
        type: 'compact',
        role: 'system',
        timestamp,
        isSidechain,
        lineNumber,
        systemSubtype: 'microcompact_boundary',
        text: typeof entry.content === 'string' ? entry.content : 'Context microcompacted',
        compactTrigger: meta?.trigger,
        compactPreTokens: meta?.preTokens,
        compactTokensSaved: meta?.tokensSaved,
      }]
    }

    // stop_hook_summary: hooks ran at session end
    if (subtype === 'stop_hook_summary') {
      return [{
        uuid,
        parentUuid,
        sessionId,
        type: 'system',
        role: 'system',
        timestamp,
        isSidechain,
        lineNumber,
        systemSubtype: 'stop_hook_summary',
        hookCount: typeof entry.hookCount === 'number' ? entry.hookCount : 0,
        preventedContinuation: entry.preventedContinuation === true,
      }]
    }

    // Generic system (turn_duration, api_error, etc.)
    // Extract content text when present (api_error has error message, etc.)
    return [{
      uuid,
      parentUuid,
      sessionId,
      type: 'system',
      role: 'system',
      timestamp,
      isSidechain,
      lineNumber,
      systemSubtype: subtype,
      text: typeof entry.content === 'string' ? entry.content : undefined,
      durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : undefined,
    }]
  }

  // ── Progress message ──────────────────────────────────────────────────────
  if (type === 'progress') {
    const data = entry.data
    const rawProgressType = data?.type ?? 'unknown'
    const progressType = classifyProgressSubtype(rawProgressType)

    const base: ParsedMessage = {
      uuid,
      parentUuid,
      sessionId,
      type: 'progress',
      role: 'system',
      timestamp,
      isSidechain,
      lineNumber,
      progressType,
      toolUseId: typeof entry.toolUseID === 'string' ? entry.toolUseID : undefined,
    }

    if (progressType === 'hook_progress' && data) {
      return [{
        ...base,
        hookEvent: typeof data.hookEvent === 'string' ? data.hookEvent : undefined,
        hookName: typeof data.hookName === 'string' ? data.hookName : undefined,
      }]
    }

    if (progressType === 'agent_progress' && data) {
      return [{
        ...base,
        agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
        agentPrompt: typeof data.prompt === 'string'
          ? data.prompt.slice(0, 500)
          : undefined,
      }]
    }

    return [base]
  }

  // ── File history snapshot ─────────────────────────────────────────────────
  if (type === 'file-history-snapshot') {
    const snapshot = entry.snapshot
    if (!snapshot || typeof snapshot !== 'object') return []

    const backups = snapshot.trackedFileBackups ?? {}
    const files = Object.entries(backups as Record<string, {
      backupFileName: string
      version: number
      backupTime: string
    }>).map(([filePath, b]) => ({
      filePath,
      backupFileName: b.backupFileName,
      version: b.version,
      backupTime: Date.parse(b.backupTime) || timestamp,
    }))

    const fileSnapshot: ParsedFileSnapshot = {
      messageId: snapshot.messageId ?? uuid,
      files,
      timestamp: Date.parse(snapshot.timestamp as string) || timestamp,
    }

    return [{
      uuid,
      parentUuid,
      sessionId,
      type: 'file_snapshot',
      role: 'system',
      timestamp,
      isSidechain,
      lineNumber,
      fileSnapshot,
    }]
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (type === 'summary') {
    return [{
      uuid,
      parentUuid,
      sessionId,
      type: 'summary',
      role: 'system',
      timestamp,
      isSidechain,
      lineNumber,
      text: typeof entry.summary === 'string' ? entry.summary : '',
    }]
  }

  return []
}

// Re-export types for external use
export type { MessageRole, MessageType }
