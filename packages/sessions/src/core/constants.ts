/**
 * Constants for message classification and filtering.
 */

// Message types that are purely metadata/control — skip for analysis
export const SKIP_TYPES = new Set([
  'session_meta',
  'session_runtime',
  'system_init',
  'queue-operation',
])

// Progress data subtypes considered "noise" (exclude from messages table)
export const NOISE_PROGRESS_SUBTYPES = new Set([
  'bash_progress',
  'hook_progress',
  'waiting_for_task',
])

// Prefixes that indicate a user message is system-injected (not real user input)
export const SYSTEM_MESSAGE_PREFIXES = [
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<system-reminder>',
  '<task-notification>',
  '<antml-use-mcp-tool>',
  // IDE context injections (cursor selection, file context)
  '<ide_selection>',
  '<file>',
  // Session continuation injection
  'This session is being continued from a previous',
  // Context compaction notices that appear as user messages
  'Conversation compacted',
  'Context microcompacted',
  // Error injections
  'Invalid API key',
  // Plan mode injection (full plan text submitted as user message)
  'Implement the following plan:',
  // Hook output injections
  '<local-hook-output>',
]

export const SYSTEM_MESSAGE_EXACT = new Set([
  'Warmup',
  'Caveat:',
])

// Tool names that indicate sub-agent spawning
// Note: computer_use is excluded — it's an MCP tool, not a subagent spawner
export const SUBAGENT_TOOL_NAMES = new Set([
  'Task',
  'dispatch_agent',
])

// Max content lengths for storage
export const MAX_TOOL_INPUT_JSON = 500
export const MAX_TOOL_OUTPUT_TEXT = 1000
export const MAX_MESSAGE_CONTENT = 2000
export const MAX_FIRST_PROMPT = 500

// Batch size for SQLite writes
export const SQLITE_BATCH_SIZE = 100
