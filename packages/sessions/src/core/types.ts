/**
 * Core types for Claude Code session parsing.
 * Based on observed JSONL format from ~/.claude/projects/
 */

// ─── Raw JSONL Entry ─────────────────────────────────────────────────────────

export interface RawJsonlEntry {
  type?: string
  subtype?: string
  uuid?: string
  parentUuid?: string | null
  /** Compact boundary messages use this instead of parentUuid when continuing after compaction */
  logicalParentUuid?: string | null
  isSidechain?: boolean
  sessionId?: string
  timestamp?: string | number
  cwd?: string
  gitBranch?: string
  version?: string
  userType?: string
  slug?: string
  permissionMode?: string

  /** True for meta/system-injected entries that are not real user messages */
  isMeta?: boolean

  // Message envelope (Claude Code native format)
  message?: RawMessage

  // Plan mode: full plan content attached to user message
  planContent?: string

  // Progress data
  data?: RawProgressData
  toolUseID?: string
  parentToolUseID?: string

  // System subtype fields
  durationMs?: number

  // Compact boundary fields
  content?: string
  level?: string
  compactMetadata?: {
    trigger?: string
    preTokens?: number
    [key: string]: unknown
  }
  microcompactMetadata?: {
    trigger?: string
    preTokens?: number
    tokensSaved?: number
    compactedToolIds?: string[]
    clearedAttachmentUUIDs?: string[]
    [key: string]: unknown
  }

  // Stop hook summary
  hookCount?: number
  hookInfos?: Array<{ command?: string; [key: string]: unknown }>
  hookErrors?: unknown[]
  preventedContinuation?: boolean
  stopReason?: string
  hasOutput?: boolean

  // File history snapshot
  snapshot?: RawSnapshot
  messageId?: string
  isSnapshotUpdate?: boolean

  // Queue operation
  operation?: string

  // Summary
  summary?: string
  leafUuid?: string

  // Session meta
  name?: string

  // Catch-all
  [key: string]: unknown
}

export interface RawMessage {
  role?: 'user' | 'assistant'
  content?: RawContentBlock[] | string
  id?: string
  model?: string
  stop_reason?: string | null
  stop_sequence?: string | null
  type?: string
  usage?: RawUsage
}

export type RawContentBlock =
  | RawTextBlock
  | RawThinkingBlock
  | RawToolUseBlock
  | RawToolResultBlock

export interface RawTextBlock {
  type: 'text'
  text: string
}

export interface RawThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface RawToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface RawToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content?: string | RawContentBlock[]
  is_error?: boolean
}

export interface RawUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation?: {
    ephemeral_5m_input_tokens?: number
    ephemeral_1h_input_tokens?: number
  }
}

export interface RawProgressData {
  type: string
  // bash_progress
  output?: string
  fullOutput?: string
  elapsedTimeSeconds?: number
  totalLines?: number
  command?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  // hook_progress
  hookEvent?: string
  hookName?: string
  // agent_progress
  agentId?: string
  prompt?: string
  message?: unknown // embedded full message from agent
  // waiting_for_task
  taskDescription?: string
  taskType?: string
  [key: string]: unknown
}

export interface RawSnapshot {
  messageId: string
  trackedFileBackups: Record<string, RawFileBackup>
  timestamp: string
}

export interface RawFileBackup {
  backupFileName: string
  version: number
  backupTime: string
}

// ─── Sessions Index ──────────────────────────────────────────────────────────

export interface SessionsIndex {
  version: number
  entries: SessionsIndexEntry[]
  originalPath?: string
}

export interface SessionsIndexEntry {
  sessionId: string
  fullPath: string
  fileMtime: number
  firstPrompt?: string
  summary?: string
  messageCount?: number
  created?: string
  modified?: string
  gitBranch?: string
  projectPath?: string
  isSidechain?: boolean
}

// ─── Parsed Message (normalized) ────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'progress'
  | 'usage'
  | 'error'
  | 'file_snapshot'
  | 'summary'
  | 'session_meta'
  | 'system'
  | 'compact'       // compact_boundary / microcompact_boundary

// Fine-grained progress subtypes for display/filtering
export type ProgressSubtype =
  | 'bash_progress'
  | 'hook_progress'
  | 'agent_progress'
  | 'waiting_for_task'
  | 'unknown'

// Fine-grained system subtypes
export type SystemSubtype =
  | 'turn_duration'
  | 'compact_boundary'
  | 'microcompact_boundary'
  | 'stop_hook_summary'
  | 'api_error'
  | 'unknown'

export interface ParsedMessage {
  uuid: string
  /** parentUuid from entry, or logicalParentUuid for compact boundaries */
  parentUuid: string | null
  sessionId: string
  type: MessageType
  role: MessageRole
  timestamp: number
  isSidechain: boolean
  lineNumber: number

  /** True for isMeta=true entries (command caveats, system injections) */
  isMeta?: boolean

  // Text content
  text?: string

  // Tool use
  toolName?: string
  toolUseId?: string
  toolInput?: Record<string, unknown>

  // Tool result
  isError?: boolean
  toolResultContent?: string

  // Progress
  progressType?: ProgressSubtype
  /** For hook_progress: the hook event type (SessionStart, Stop, etc.) */
  hookEvent?: string
  hookName?: string
  /** For agent_progress: the sub-agent identifier */
  agentId?: string
  /** For agent_progress: the agent's task prompt */
  agentPrompt?: string

  // Usage (from assistant message.usage)
  usage?: ParsedUsage

  // Model (from assistant message.model)
  model?: string

  // Git/session context from user messages
  gitBranch?: string
  cwd?: string
  version?: string
  permissionMode?: string

  // Plan mode: present when user message was submitted from plan mode
  planContent?: string

  // File snapshot
  fileSnapshot?: ParsedFileSnapshot

  // Whether this message has a stop_reason (final in streaming)
  isFinalAssistant?: boolean

  // Compact event metadata
  compactTrigger?: string
  compactPreTokens?: number
  compactTokensSaved?: number  // microcompact only

  // System subtype
  systemSubtype?: SystemSubtype

  // Stop hook summary
  hookCount?: number
  preventedContinuation?: boolean

  // turn_duration system message
  durationMs?: number
}

export interface ParsedUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface ParsedFileSnapshot {
  messageId: string
  files: ParsedFileBackup[]
  timestamp: number
}

export interface ParsedFileBackup {
  filePath: string
  backupFileName: string
  version: number
  backupTime: number
}

// ─── Session Summary ─────────────────────────────────────────────────────────

export interface SessionMeta {
  sessionId: string
  filePath: string
  fileSize: number
  fileMtimeMs: number
  projectDirName: string
  projectPath: string

  firstPrompt?: string
  summary?: string
  gitBranch?: string
  permissionMode?: string
  modelPrimary?: string
  cwd?: string

  sessionStartedAt?: number
  sessionEndedAt?: number
  durationSeconds?: number

  messageCount: number
  userMsgCount: number
  assistantMsgCount: number
  toolUseCount: number
  subagentCount: number

  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  estimatedCostUsd: number
}

// ─── Project Info ─────────────────────────────────────────────────────────────

export interface ProjectInfo {
  dirName: string
  projectPath: string
  sessionCount: number
  totalFileSize: number
  hasSessionsIndex: boolean
  sessionIds: string[]
}

// ─── Tool Call (paired tool_use + tool_result) ────────────────────────────────

export interface ToolCall {
  toolUseId: string
  sessionId: string
  toolName: string
  inputJson: string
  outputText: string
  success: boolean
  lineNumber: number
}

// ─── Chain Node ────────────────────────────────────────────────────────────────

export interface ChainNode {
  uuid: string
  parentUuid: string | null
  type: MessageType
  role: MessageRole
  timestamp: number
  isSidechain: boolean
  children: string[]
}

export interface MessageChain {
  nodes: Map<string, ChainNode>
  roots: string[]
  mainTimeline: string[]
  branchPoints: string[]
}
