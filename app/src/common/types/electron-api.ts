import type { PermissionMode, ExecutionOptions, HookSettings } from './execution'
import type { Message } from './message'
import type { PermissionResponse, AskUserQuestionResponse, ExitPlanModeResponse, AskUserQuestionRequest, ExitPlanModeRequest, PermissionRequest } from './interaction'
import type { Session, CreateSessionInput, SessionState, ResumeSessionResult } from './session'
import type { ProjectInfo, HistoryEntry, RewindFilesResult, FileEntry, SessionMetadata } from './history'
import type { AppPreferences } from './preferences'
import type { PluginInfo, AgentInfo, McpServerConfig, CliHooks, MemoryFile } from './config'
import type { WorktreeListEntry, WorktreeDiffInfo } from './worktree'
import type { UsageCommand, UsageReport } from './usage'

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
  triggerSync: () => Promise<import('../sync-types').SyncResult | null>

  // 事件监听
  onClaudeMessage: (callback: (message: Message) => void) => () => void
  onSessionStatus: (callback: (state: SessionState) => void) => () => void
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void
  onAskUserQuestion: (callback: (request: AskUserQuestionRequest) => void) => () => void
  onExitPlanMode: (callback: (request: ExitPlanModeRequest) => void) => () => void
  onMultiSessionStateChanged: (callback: (state: import('../multi-session-types').MultiSessionManagerState) => void) => () => void
  onUsageStatsUpdated: (callback: () => void) => () => void
  onSyncCompleted: (callback: (result: import('../sync-types').SyncResult) => void) => () => void
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
