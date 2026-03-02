// ============================================================
// SDK 类型镜像 — 不从 SDK 包 import，仅描述运行时结构
// ============================================================

// ── Content Blocks ──

export interface SDKTextBlock {
  readonly type: 'text'
  readonly text: string
}

export interface SDKThinkingBlock {
  readonly type: 'thinking'
  readonly thinking: string
  readonly signature?: string
}

export interface SDKToolUseBlock {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
  readonly signature?: string
}

export interface SDKToolResultBlock {
  readonly type: 'tool_result'
  readonly tool_use_id: string
  /** Can be a plain string or an array of content blocks [{type: "text", text: "..."}] */
  readonly content: string | readonly { readonly type: string; readonly text?: string }[]
  readonly is_error?: boolean
}

export interface SDKUnknownBlock {
  readonly type: string
  readonly [key: string]: unknown
}

export type SDKContentBlock =
  | SDKTextBlock
  | SDKThinkingBlock
  | SDKToolUseBlock
  | SDKToolResultBlock
  | SDKUnknownBlock

// ── Usage ──

export interface SDKUsage {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens?: number
  readonly cache_creation_input_tokens?: number
}

// ── Beta Message (嵌套在 assistant 消息中) ──

export interface SDKBetaMessage {
  readonly id: string
  readonly role: 'assistant'
  readonly content: readonly SDKContentBlock[]
  readonly usage?: SDKUsage
  readonly model?: string
  readonly stop_reason?: string | null
  readonly stop_sequence?: string | null
  readonly type?: 'message'
  readonly context_management?: unknown
}

// ── 顶层 SDK 消息变体 ──

export interface SDKAssistantMessage {
  readonly type: 'assistant'
  readonly uuid: string
  readonly message: SDKBetaMessage
  readonly parent_tool_use_id: string | null
  readonly session_id: string
  readonly error?: SDKAssistantMessageError
}

export type SDKAssistantMessageError =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens'

export interface SDKToolUseResult {
  readonly stdout?: string
  readonly stderr?: string
  readonly interrupted?: boolean
  readonly isImage?: boolean
  readonly noOutputExpected?: boolean
  readonly type?: string
  readonly file?: {
    readonly filePath: string
    readonly content: string
    readonly numLines: number
    readonly startLine: number
    readonly totalLines: number
  }
}

export interface SDKUserMessage {
  readonly type: 'user'
  readonly uuid: string
  readonly message: {
    readonly role: 'user'
    readonly content: string | readonly SDKContentBlock[]
  }
  readonly parent_tool_use_id?: string | null
  readonly session_id?: string
  readonly tool_use_result?: SDKToolUseResult
}

export interface SDKResultSuccess {
  readonly type: 'result'
  readonly subtype: 'success'
  readonly uuid: string
  readonly session_id: string
  readonly usage: SDKUsage
  readonly is_error: boolean
  readonly result: string
  readonly duration_ms: number
  readonly duration_api_ms: number
  readonly num_turns: number
  readonly total_cost_usd: number
  readonly stop_reason: string | null
  readonly modelUsage: Record<string, unknown>
  readonly permission_denials: readonly unknown[]
  readonly structured_output?: unknown
}

export interface SDKResultError {
  readonly type: 'result'
  readonly subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries'
  readonly uuid: string
  readonly session_id: string
  readonly errors: readonly string[]
  readonly is_error: boolean
  readonly duration_ms: number
  readonly duration_api_ms: number
  readonly num_turns: number
  readonly total_cost_usd: number
  readonly usage: SDKUsage
  readonly modelUsage: Record<string, unknown>
  readonly permission_denials: readonly unknown[]
  readonly stop_reason: string | null
}

export type SDKResultMessage = SDKResultSuccess | SDKResultError

export interface SDKSystemInit {
  readonly type: 'system'
  readonly subtype: 'init'
  readonly session_id: string
  readonly uuid?: string
  readonly model?: string
  readonly tools?: readonly string[]
  readonly cwd?: string
  readonly permissionMode?: string
  readonly permission_mode?: string
  readonly claude_code_version?: string
  readonly apiKeySource?: string
  readonly output_style?: string
  readonly mcp_servers?: readonly unknown[]
  readonly slash_commands?: readonly string[]
  readonly agents?: readonly string[]
  readonly skills?: readonly string[]
  readonly plugins?: readonly unknown[]
  readonly fast_mode_state?: string
}

export interface SDKSystemStatus {
  readonly type: 'system'
  readonly subtype: 'status'
  readonly status: 'compacting' | null
  readonly permissionMode?: string
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemCompactBoundary {
  readonly type: 'system'
  readonly subtype: 'compact_boundary'
  readonly compact_metadata: {
    readonly trigger: 'manual' | 'auto'
    readonly pre_tokens: number
  }
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemHookStarted {
  readonly type: 'system'
  readonly subtype: 'hook_started'
  readonly hook_id: string
  readonly hook_name: string
  readonly hook_event: string
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemHookProgress {
  readonly type: 'system'
  readonly subtype: 'hook_progress'
  readonly hook_id: string
  readonly hook_name: string
  readonly hook_event: string
  readonly stdout: string
  readonly stderr: string
  readonly output: string
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemHookResponse {
  readonly type: 'system'
  readonly subtype: 'hook_response'
  readonly hook_id: string
  readonly hook_name: string
  readonly hook_event: string
  readonly output: string
  readonly stdout: string
  readonly stderr: string
  readonly exit_code?: number
  readonly outcome: 'success' | 'error' | 'cancelled'
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemTaskNotification {
  readonly type: 'system'
  readonly subtype: 'task_notification'
  readonly task_id: string
  readonly status: 'completed' | 'failed' | 'stopped'
  readonly output_file: string
  readonly summary: string
  readonly uuid?: string
  readonly session_id?: string
}

export interface SDKSystemFilesPersisted {
  readonly type: 'system'
  readonly subtype: 'files_persisted'
  readonly files: readonly { readonly filename: string; readonly file_id: string }[]
  readonly failed: readonly { readonly filename: string; readonly error: string }[]
  readonly processed_at: string
  readonly uuid: string
  readonly session_id: string
}

// ── Stream Event（嵌套 event 对象） ──

export type SDKStreamEventType =
  | 'message_start'
  | 'message_delta'
  | 'message_stop'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'

export interface SDKStreamEventDelta {
  readonly type: 'text_delta' | 'thinking_delta' | 'input_json_delta'
  readonly text?: string
  readonly thinking?: string
  readonly partial_json?: string
}

export interface SDKStreamEventInner {
  readonly type: SDKStreamEventType
  readonly index?: number
  readonly content_block?: SDKContentBlock
  readonly delta?: SDKStreamEventDelta
  readonly message?: SDKBetaMessage
  readonly usage?: SDKUsage
}

export interface SDKStreamEvent {
  readonly type: 'stream_event'
  readonly uuid?: string
  readonly event: SDKStreamEventInner
  readonly session_id?: string
  readonly parent_tool_use_id?: string | null
}

export interface SDKToolProgress {
  readonly type: 'tool_progress'
  readonly uuid: string
  readonly tool_name: string
  readonly tool_use_id: string
  readonly parent_tool_use_id: string | null
  readonly elapsed_time_seconds: number
  readonly session_id: string
}

export interface SDKToolUseSummary {
  readonly type: 'tool_use_summary'
  readonly uuid: string
  readonly summary: string
  readonly preceding_tool_use_ids: readonly string[]
  readonly session_id: string
}

export interface SDKAuthStatus {
  readonly type: 'auth_status'
  readonly [key: string]: unknown
}

export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | SDKSystemInit
  | SDKSystemStatus
  | SDKSystemCompactBoundary
  | SDKSystemHookStarted
  | SDKSystemHookProgress
  | SDKSystemHookResponse
  | SDKSystemTaskNotification
  | SDKSystemFilesPersisted
  | SDKStreamEvent
  | SDKToolProgress
  | SDKToolUseSummary
  | SDKAuthStatus

// ── 权限相关 ──

export interface SDKCanUseToolOptions {
  readonly signal: AbortSignal
  readonly toolUseID: string
  readonly suggestions?: readonly unknown[]
  readonly blockedPath?: string
  readonly decisionReason?: string
  readonly agentID?: string
}

export interface SDKPermissionAllow {
  readonly behavior: 'allow'
  readonly toolUseID: string
  readonly updatedInput?: Record<string, unknown>
}

export interface SDKPermissionDeny {
  readonly behavior: 'deny'
  readonly message: string
  readonly toolUseID: string
  readonly interrupt?: boolean
}

export type SDKPermissionResult = SDKPermissionAllow | SDKPermissionDeny

export type SDKCanUseToolCallback = (
  toolName: string,
  toolInput: Record<string, unknown>,
  options: SDKCanUseToolOptions,
) => Promise<SDKPermissionResult>

// ── Agent 定义（传给 SDK query() options.agents） ──

export interface SDKAgentDefinition {
  readonly description: string
  readonly prompt: string
  readonly tools?: string[]
  readonly model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  readonly maxTurns?: number
}

// ── MCP Server 配置（传给 SDK query() options.mcpServers） ──

export interface SDKMcpStdioServerConfig {
  readonly type?: 'stdio'
  readonly command: string
  readonly args?: string[]
  readonly env?: Record<string, string>
}

export interface SDKMcpSSEServerConfig {
  readonly type: 'sse'
  readonly url: string
  readonly headers?: Record<string, string>
}

export interface SDKMcpHttpServerConfig {
  readonly type: 'http'
  readonly url: string
  readonly headers?: Record<string, string>
}

export type SDKMcpServerConfig = SDKMcpStdioServerConfig | SDKMcpSSEServerConfig | SDKMcpHttpServerConfig

// ── Session Metadata (从 init 消息提取) ──

export interface SessionMetadata {
  readonly sessionId: string
  readonly model?: string
  readonly tools?: readonly string[]
  readonly cwd?: string
  readonly permissionMode?: string
  readonly claudeCodeVersion?: string
  readonly apiKeySource?: string
  readonly mcpServers?: readonly unknown[]
  readonly slashCommands?: readonly string[]
  readonly agents?: readonly string[]
  readonly skills?: readonly string[]
  readonly fastModeState?: string
}

// ── Structured Output ──

export interface SDKOutputFormat {
  readonly type: 'json_schema'
  readonly schema: {
    readonly name: string
    readonly description?: string
    readonly schema: Record<string, unknown>
  }
}

//  Query 控制接口（SDK query() 返回值）

/** Mirror of SDK's Query interface  only the control methods we need. */
export interface SDKQuery extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>
  rewindFiles(
    userMessageId: string,
    options?: { dryRun?: boolean },
  ): Promise<{
    canRewind: boolean
    error?: string
    filesChanged?: string[]
    insertions?: number
    deletions?: number
  }>
  close(): void
}
