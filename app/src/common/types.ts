// ============================================================
// 核心类型定义 — 三进程共享
// ============================================================

// ── 权限模式（SDK 5 种，UI 仅展示前 4 种） ──

export type PermissionMode =
  | "default"
  | "plan"
  | "acceptEdits"
  | "dontAsk"
  | "bypassPermissions"

/** Canonical permission mode options for UI rendering (matches official Claude Code UI). */
export const PERMISSION_MODE_OPTIONS: readonly { readonly value: PermissionMode; readonly label: string }[] = [
  { value: "default", label: "Ask permissions" },
  { value: "acceptEdits", label: "Auto accept edits" },
  { value: "plan", label: "Plan mode" },
  { value: "bypassPermissions", label: "Bypass permissions" },
] as const

export type RuntimeProvider = "claude" | "codex" | "opencode"

// ── 模型别名 + Effort ──

/** Model short alias used in UI selectors and SDK agent definitions. */
export type ModelAlias = 'sonnet' | 'opus' | 'haiku'

/** SDK effort level — controls thinking depth. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

/** SDK thinking configuration — replaces deprecated maxThinkingTokens. */
export type ThinkingConfig =
  | { readonly type: 'adaptive' }
  | { readonly type: 'enabled'; readonly budgetTokens?: number }
  | { readonly type: 'disabled' }

/** Options for the thinking mode dropdown in UI. */
export const THINKING_MODE_OPTIONS: readonly { readonly value: ThinkingConfig['type'] | ''; readonly label: string; readonly description: string }[] = [
  { value: '', label: 'SDK Default', description: 'Let SDK decide' },
  { value: 'adaptive', label: 'Adaptive', description: 'Claude decides when and how much to think (Opus 4.6+)' },
  { value: 'enabled', label: 'Fixed Budget', description: 'Set a fixed thinking token budget' },
  { value: 'disabled', label: 'Disabled', description: 'No extended thinking' },
] as const

/** Options for the model alias dropdown in UI. */
export const MODEL_ALIAS_OPTIONS: readonly { readonly value: ModelAlias | ''; readonly label: string }[] = [
  { value: '', label: 'SDK default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
] as const

/** Options for the effort level dropdown in UI. */
export const EFFORT_LEVEL_OPTIONS: readonly { readonly value: EffortLevel | ''; readonly label: string }[] = [
  { value: '', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
] as const

// ── 执行参数（Phase 2）──

/** SDK query() execution parameters exposed to the UI. */
export interface ExecutionOptions {
  /** Model alias or full ID, e.g. 'sonnet' or 'claude-sonnet-4-6'. Defaults to SDK default. */
  readonly model?: string
  /** Maximum conversation turns. Defaults to unlimited. */
  readonly maxTurns?: number
  /** Budget cap in USD. Session aborts when exceeded. */
  readonly maxBudgetUsd?: number
  /** Thinking configuration for extended reasoning. */
  readonly thinking?: ThinkingConfig
  /** Effort level — controls thinking depth. */
  readonly effort?: EffortLevel
}

/** Phase 2: SDK hooks configuration exposed to the UI. */
export interface HookSettings {
  /** Auto-allow read-only tools (Read, Glob, LS, ListDir) without permission prompt. */
  readonly autoAllowReadOnly: boolean
  /** Bash command patterns to auto-deny (e.g. 'rm -rf', 'sudo'). */
  readonly blockedCommands: readonly string[]
}

// ── 会话 ──

export interface Session {
  readonly id: string
  readonly name: string
  readonly projectPath: string
  readonly runtime: RuntimeProvider
  readonly permissionMode: PermissionMode
  readonly createdAt: number
  readonly updatedAt: number
  readonly worktree?: WorktreeInfo
}

export interface CreateSessionInput {
  readonly name: string
  readonly projectPath: string
  readonly runtime?: RuntimeProvider
  readonly permissionMode: PermissionMode
  /** Create session in an isolated git worktree. */
  readonly useWorktree?: boolean
}

// ── 消息 ──

export type MessageRole = "user" | "assistant" | "system" | "tool"

export type MessageType =
  | "text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "tool_progress"
  | "permission_request"
  | "error"
  | "usage"
  | "compact"

export interface Message {
  readonly id: string
  readonly sessionId: string
  readonly role: MessageRole
  readonly type: MessageType
  readonly content: string
  readonly timestamp: number

  // tool_use / tool_result
  readonly toolName?: string
  readonly toolInput?: Record<string, unknown>
  readonly toolUseId?: string

  // tool_result
  readonly toolResult?: string
  readonly success?: boolean

  // usage
  readonly usage?: TokenUsage

  // stream
  readonly isStreamDelta?: boolean
  readonly isReplay?: boolean

  /** Parent tool_use ID indicating this message came from a sub-agent */
  readonly parentToolUseId?: string
}

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly costUsd?: number
  readonly numTurns?: number
  readonly durationMs?: number
}

// ── AskUserQuestion 交互 ──

export interface AskUserQuestionOption {
  readonly label: string
  readonly description: string
}

export interface AskUserQuestionItem {
  readonly question: string
  readonly header: string
  readonly options: readonly AskUserQuestionOption[]
  readonly multiSelect: boolean
}

export interface AskUserQuestionRequest {
  readonly id: string
  readonly toolUseId: string
  readonly questions: readonly AskUserQuestionItem[]
}

export interface AskUserQuestionResponse {
  readonly requestId: string
  /** question text → selected label; multi-select labels are comma-separated */
  readonly answers: Readonly<Record<string, string>>
  readonly cancelled: boolean
}

// ── ExitPlanMode 审批 ──

export interface ExitPlanModeRequest {
  readonly id: string
  readonly toolUseId: string
  readonly allowedPrompts?: readonly { tool: string; prompt: string }[]
}

export interface ExitPlanModeResponse {
  readonly requestId: string
  /** true = 允许计划执行（选项1/2/3），false = 拒绝/继续规划（选项4） */
  readonly allowed: boolean
  /** 仅当 allowed=false 时：反馈给 Claude 的说明文字 */
  readonly feedback?: string
}

// ── 权限审批 ──

export interface PermissionRequest {
  readonly id: string
  readonly toolName: string
  readonly toolInput: Record<string, unknown>
  readonly description: string
  readonly risk: "low" | "medium" | "high"
  readonly toolUseId?: string
  readonly agentId?: string
  readonly suggestions?: readonly unknown[]
  readonly decisionReason?: string
}

export interface PermissionResponse {
  readonly requestId: string
  readonly allowed: boolean
  readonly reason?: string
  /** 本次会话自动允许此工具 */
  readonly rememberForSession?: boolean
  /** 记忆粒度: 'tool' = 整个工具类型, 'input' = 精确匹配输入 */
  readonly rememberScope?: 'input' | 'tool'
}

// ── 会话状态 ──

export type SessionStatus = "idle" | "streaming" | "waiting_permission" | "error"

export interface SessionState {
  readonly sessionId: string
  readonly status: SessionStatus
  readonly error?: string
}

export interface ResumeSessionResult {
  readonly success: boolean
  readonly session: Session | null
  readonly messages: readonly Message[]
}

/** Info about a discovered project directory. */
export interface ProjectInfo {
  readonly path: string
  readonly sessionCount: number
  readonly lastAccessed: number
}

/** A session entry discovered from ~/.claude/projects/ JSONL files. */
export interface HistoryEntry {
  /** Session ID (JSONL filename without extension). */
  readonly sessionId: string
  /** Human-readable title (inferred from first user message). */
  readonly title: string
  /** Decoded project path this session belongs to. */
  readonly projectPath: string
  /** Absolute path to the .jsonl file on disk. */
  readonly sessionFile: string
  /** Timestamp of last modification (mtimeMs). */
  readonly lastActiveAt: number
  /** Number of real user+assistant messages (excludes tool_result, system). */
  readonly messageCount: number
  /** UUID of first user message with parentUuid===null. Used to dedup resumed sessions. */
  readonly conversationRoot?: string
}

// ── 会话元数据（SDK system/init → 渲染进程） ──

/** Metadata from SDK system/init — pushed to renderer after session starts */
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
  readonly plugins?: readonly unknown[]
  readonly fastModeState?: string
}

// ── Checkpoint ──

/** Result of a rewindFiles() operation. */
export interface RewindFilesResult {
  readonly canRewind: boolean
  readonly error?: string
  readonly filesChanged?: readonly string[]
  readonly insertions?: number
  readonly deletions?: number
}

// ── 文件管理器 ──

export interface FileEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly size?: number
}

// ── 结构化输出（Structured Output） ──

export interface StructuredOutputConfig {
  readonly enabled: boolean
  readonly name: string
  readonly description?: string
  /** JSON Schema string (serialized for storage, parsed on use) */
  readonly schema: string
}

// ── 应用偏好（L3：GUI 独有，存储在 userData） ──

export interface AppPreferences {
  readonly theme: "light" | "dark" | "warm" | "system"
  readonly defaultPermissionMode: PermissionMode
  readonly defaultProjectPath?: string
  readonly defaultRuntime?: RuntimeProvider
  /** Enable SDK file checkpointing (default: true). */
  readonly checkpointEnabled?: boolean
  /** Last active session ID — restored on app restart. */
  readonly lastSessionId?: string
  /** Last active project path — restored on app restart. */
  readonly lastProjectPath?: string
  /** Model alias → full model ID mappings. */
  readonly modelAliases?: Readonly<Record<string, string>>
  /** Structured output configuration (JSON Schema). */
  readonly structuredOutput?: StructuredOutputConfig
}

/** State of the backend session manager, pushed to renderer on change.
 *  Retained for backward compatibility — derived from focused session in multi-session mode. */
export interface SessionManagerState {
  readonly currentSessionId: string | null
  readonly currentProjectPath: string | null
  readonly sdkSessionId: string | null
  readonly sessionStatus: SessionState["status"]
  readonly currentError: string | null
}

/** Worktree metadata attached to a session. */
export interface WorktreeInfo {
  readonly worktreePath: string
  readonly branchName: string
  readonly baseBranch: string
}

/** A git worktree entry returned from `git worktree list`. */
export interface WorktreeListEntry {
  readonly path: string
  readonly branch: string
  readonly head: string
  readonly isBare: boolean
}

/** Diff info between a worktree branch and its base. */
export interface WorktreeDiffInfo {
  readonly files: readonly string[]
  readonly insertions: number
  readonly deletions: number
  readonly diff: string
}

// ── Usage 统计（ccusage） ──

export type UsageCommand = 'daily' | 'monthly' | 'session'

export interface UsageModelBreakdown {
  readonly modelName: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly cost: number
}

export interface UsageReport {
  readonly date?: string
  readonly month?: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly totalTokens: number
  readonly totalCost: number
  readonly modelsUsed?: readonly string[]
  readonly modelBreakdowns?: readonly UsageModelBreakdown[]
}

// ── Phase 3: Plugin 信息 ──

export interface PluginInfo {
  readonly id: string
  readonly marketplace: string
  readonly version: string
  readonly installedAt: string
  readonly lastUpdated: string
  readonly enabled: boolean
}

// ── Phase 3: Agent / Skill 信息 ──

export interface AgentInfo {
  readonly filename: string
  readonly name: string
  readonly description?: string
  readonly scope: 'user' | 'project'
}

export interface SkillInfo {
  readonly name: string
  readonly source: string
}

// ── Phase 3: MCP 服务器配置 ──

export interface McpServerConfig {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly scope: 'user' | 'project'
}

// ── Phase 3: CLI Hooks ──

export type CliHookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentTool'
  | 'TaskCompleted'
  | 'TeammateIdle'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'
  | 'UserPromptSubmit'

export interface CliHookEntry {
  readonly type: 'command'
  readonly command: string
  readonly timeout?: number
  readonly timeout_ms?: number
  readonly statusMessage?: string
  readonly async?: boolean
  readonly description?: string
}

export interface CliHookRule {
  readonly matcher: string
  readonly hooks: readonly CliHookEntry[]
  readonly description?: string
}

export type CliHooks = Readonly<Record<string, readonly CliHookRule[]>>

// ── Phase 3: Memory 文件 ──

export interface MemoryFile {
  readonly path: string
  readonly name: string
  readonly scope: 'user-global' | 'project' | 'project-memory'
  readonly lastModified?: number
  readonly sizeBytes?: number
  readonly content?: string
}

// ── Preload API 类型（渲染进程可用） ──

export interface ElectronAPI {
  // Claude 交互
  sendMessage: (sessionId: string, content: string, permissionMode?: PermissionMode, executionOptions?: ExecutionOptions, hookSettings?: HookSettings) => Promise<void>
  abort: (sessionId: string) => Promise<void>
  respondPermission: (response: PermissionResponse) => Promise<void>
  respondAskUserQuestion: (response: AskUserQuestionResponse) => Promise<void>
  respondExitPlanMode: (response: ExitPlanModeResponse) => Promise<void>

  // 会话管理
  getSessions: (projectPath?: string) => Promise<readonly Session[]>
  createSession: (input: CreateSessionInput) => Promise<Session>
  resumeSession: (sessionId: string) => Promise<ResumeSessionResult>
  switchSession: (sessionId: string) => Promise<ResumeSessionResult>
  deleteSession: (sessionId: string) => Promise<void>
  getSessionMessages: (sessionId: string) => Promise<readonly Message[]>
  scanProjects: () => Promise<readonly ProjectInfo[]>

  // 历史浏览
  getAllSessions: () => Promise<readonly HistoryEntry[]>
  searchSessions: (query: string) => Promise<readonly HistoryEntry[]>

  // Checkpoint
  rewindFiles: (sessionId: string, userMessageId: string, dryRun?: boolean) => Promise<RewindFilesResult>

  // 设置
  getSettings: () => Promise<AppPreferences>
  updateSettings: (settings: Partial<AppPreferences>) => Promise<void>

  // 项目
  selectDirectory: () => Promise<string | null>
  notifyProjectSelected: (projectPath: string) => Promise<void>

  // 文件管理器
  listDirectory: (dirPath: string) => Promise<readonly FileEntry[]>

  // CLI 配置（env 管理）
  getEnvVars: () => Promise<Record<string, string>>
  setEnvVar: (name: string, value: string) => Promise<void>
  removeEnvVar: (name: string) => Promise<void>

  // Phase 3: Plugins
  getPlugins: () => Promise<readonly PluginInfo[]>
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>

  // Phase 3: Agents & Skills
  getAgents: () => Promise<readonly AgentInfo[]>
  getAgentContent: (filePath: string) => Promise<string>

  // Phase 3: MCP Servers
  getMcpServers: () => Promise<readonly McpServerConfig[]>
  updateMcpServer: (scope: 'user' | 'project', name: string, config: Omit<McpServerConfig, 'name' | 'scope'>) => Promise<void>
  removeMcpServer: (scope: 'user' | 'project', name: string) => Promise<void>

  // Phase 3: CLI Hooks
  getCliHooks: () => Promise<CliHooks>
  updateCliHooks: (hooks: CliHooks) => Promise<void>

  // Usage 统计
  getUsageStats: (command: UsageCommand) => Promise<readonly UsageReport[]>

  // Phase 3: Memory
  getMemoryFiles: () => Promise<readonly MemoryFile[]>
  getMemoryContent: (filePath: string) => Promise<string>
  updateMemoryContent: (filePath: string, content: string) => Promise<void>

  // Git info
  getGitBranch: (projectPath: string) => Promise<string | null>

  // Worktree management
  getWorktrees: (projectPath: string) => Promise<readonly WorktreeListEntry[]>
  mergeWorktree: (sessionId: string, worktreeBranch: string, baseBranch: string) => Promise<{ success: boolean; error?: string }>
  removeWorktree: (sessionId: string) => Promise<void>
  getWorktreeDiff: (baseBranch: string, worktreeBranch: string) => Promise<WorktreeDiffInfo>

  // Sync
  triggerSync: () => Promise<import('./sync-types').SyncResult | null>

  // 事件监听
  onClaudeMessage: (callback: (message: Message) => void) => () => void
  onSessionStatus: (callback: (state: SessionState) => void) => () => void
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void
  onAskUserQuestion: (callback: (request: AskUserQuestionRequest) => void) => () => void
  onExitPlanMode: (callback: (request: ExitPlanModeRequest) => void) => () => void
  onMultiSessionStateChanged: (callback: (state: import('./multi-session-types').MultiSessionManagerState) => void) => () => void
  onUsageStatsUpdated: (callback: () => void) => () => void
  onSyncCompleted: (callback: (result: import('./sync-types').SyncResult) => void) => () => void
  onSessionMetadata: (callback: (metadata: SessionMetadata) => void) => () => void

  // Multi-session management
  focusSession: (sessionId: string) => Promise<void>
  closeSessionTab: (sessionId: string) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
