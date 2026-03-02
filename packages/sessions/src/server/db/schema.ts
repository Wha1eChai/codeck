import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), // = dirName
  projectPath: text('project_path').notNull(),
  sessionCount: integer('session_count').notNull().default(0),
  totalFileSize: integer('total_file_size').notNull().default(0),
  hasSessionsIndex: integer('has_sessions_index', { mode: 'boolean' }).notNull().default(false),
  lastSyncedAt: integer('last_synced_at'), // epoch ms
})

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // = sessionId (UUID)
  projectId: text('project_id').notNull().references(() => projects.id),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  fileMtimeMs: integer('file_mtime_ms').notNull().default(0),

  // Content metadata
  firstPrompt: text('first_prompt'),
  summary: text('summary'),
  gitBranch: text('git_branch'),
  permissionMode: text('permission_mode'),
  modelPrimary: text('model_primary'),
  cwd: text('cwd'),

  // Statistics
  messageCount: integer('message_count').notNull().default(0),
  userMsgCount: integer('user_msg_count').notNull().default(0),
  assistantMsgCount: integer('assistant_msg_count').notNull().default(0),
  toolUseCount: integer('tool_use_count').notNull().default(0),
  subagentCount: integer('subagent_count').notNull().default(0),

  // Token stats
  totalInputTokens: integer('total_input_tokens').notNull().default(0),
  totalOutputTokens: integer('total_output_tokens').notNull().default(0),
  totalCacheCreationTokens: integer('total_cache_creation_tokens').notNull().default(0),
  totalCacheReadTokens: integer('total_cache_read_tokens').notNull().default(0),
  estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),

  // Timing
  sessionStartedAt: integer('session_started_at'), // epoch ms
  sessionEndedAt: integer('session_ended_at'), // epoch ms
  durationSeconds: integer('duration_seconds'),

  // Conversation chain: UUID of the first root user message (parentUuid === null).
  // Used by cc-desk to deduplicate resumed sessions (same conversation, multiple files).
  conversationRoot: text('conversation_root'),

  // Parse state
  parseStatus: text('parse_status', {
    enum: ['pending', 'parsed', 'error'],
  }).notNull().default('pending'),
  parseError: text('parse_error'),
  parsedAt: integer('parsed_at'), // epoch ms
}, (t) => [
  index('sessions_project_idx').on(t.projectId),
  index('sessions_started_idx').on(t.sessionStartedAt),
  index('sessions_cost_idx').on(t.estimatedCostUsd),
])

// ─── Messages ────────────────────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  parentUuid: text('parent_uuid'),
  type: text('type').notNull(),
  role: text('role').notNull(),
  timestamp: integer('timestamp'), // epoch ms
  isSidechain: integer('is_sidechain', { mode: 'boolean' }).notNull().default(false),
  lineNumber: integer('line_number').notNull().default(0),

  // Content (truncated)
  content: text('content'),

  // Tool info
  toolName: text('tool_name'),
  toolUseId: text('tool_use_id'),
  isError: integer('is_error', { mode: 'boolean' }),

  // Token info
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),

  // Model
  model: text('model'),
}, (t) => [
  index('messages_session_idx').on(t.sessionId),
  index('messages_uuid_idx').on(t.uuid),
  index('messages_type_idx').on(t.type),
  index('messages_tool_name_idx').on(t.toolName),
])

// ─── Tool Calls ──────────────────────────────────────────────────────────────

export const toolCalls = sqliteTable('tool_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolUseId: text('tool_use_id').notNull(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  toolName: text('tool_name').notNull(),
  inputJson: text('input_json'),
  outputText: text('output_text'),
  success: integer('success', { mode: 'boolean' }).notNull().default(true),
  lineNumber: integer('line_number').notNull().default(0),
}, (t) => [
  index('tool_calls_session_idx').on(t.sessionId),
  index('tool_calls_tool_name_idx').on(t.toolName),
])

// ─── File Changes ─────────────────────────────────────────────────────────────

export const fileChanges = sqliteTable('file_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  filePath: text('file_path').notNull(),
  backupFileName: text('backup_file').notNull(),
  version: integer('version').notNull().default(1),
  backupTime: integer('backup_time'), // epoch ms
  snapshotMessageId: text('snapshot_message_id'),
}, (t) => [
  index('file_changes_session_idx').on(t.sessionId),
  index('file_changes_path_idx').on(t.filePath),
])

// ─── Subagents ────────────────────────────────────────────────────────────────

export const subagents = sqliteTable('subagents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolUseId: text('tool_use_id').notNull(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  toolName: text('tool_name').notNull(),
  triggerPrompt: text('trigger_prompt'),
  progressEventCount: integer('progress_event_count').notNull().default(0),
}, (t) => [
  index('subagents_session_idx').on(t.sessionId),
])

// Type exports
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type ToolCallRecord = typeof toolCalls.$inferSelect
export type NewToolCall = typeof toolCalls.$inferInsert
export type FileChange = typeof fileChanges.$inferSelect
export type NewFileChange = typeof fileChanges.$inferInsert
export type Subagent = typeof subagents.$inferSelect
export type NewSubagent = typeof subagents.$inferInsert
