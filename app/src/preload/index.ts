import { contextBridge, ipcRenderer } from "electron"
import { RENDERER_TO_MAIN, MAIN_TO_RENDERER } from "@common/ipc-channels"
import type {
  ElectronAPI,
  ExecutionOptions,
  HookSettings,
  HistoryEntry,
  Message,
  SessionMetadata,
  SessionState,
  PermissionRequest,
  PermissionResponse,
  AskUserQuestionRequest,
  AskUserQuestionResponse,
  ExitPlanModeRequest,
  ExitPlanModeResponse,
  CreateSessionInput,
  ResumeSessionResult,
  RewindFilesResult,
  ProjectInfo,
  AppPreferences,
  PluginInfo,
  AgentInfo,
  McpServerConfig,
  CliHooks,
  MemoryFile,
  UsageCommand,
  UsageReport,
  WorktreeListEntry,
  WorktreeDiffInfo,
} from "@common/types"
import type { MultiSessionManagerState } from "@common/multi-session-types"

const api: ElectronAPI = {
  // ── Claude 交互 ──

  sendMessage: (sessionId: string, content: string, permissionMode?: string, executionOptions?: ExecutionOptions, hookSettings?: HookSettings) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SEND_MESSAGE, sessionId, content, permissionMode, executionOptions, hookSettings),

  abort: (sessionId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.ABORT, sessionId),

  respondPermission: (response: PermissionResponse) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.PERMISSION_RESPONSE, response),

  respondAskUserQuestion: (response: AskUserQuestionResponse) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.ASK_USER_QUESTION_RESPONSE, response),

  respondExitPlanMode: (response: ExitPlanModeResponse) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.EXIT_PLAN_MODE_RESPONSE, response),

  // ── 会话管理 ──

  getSessions: (projectPath?: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_SESSIONS, projectPath),

  createSession: (input: CreateSessionInput) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.CREATE_SESSION, input),

  resumeSession: (sessionId: string): Promise<ResumeSessionResult> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.RESUME_SESSION, sessionId),

  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.DELETE_SESSION, sessionId),

  getSessionMessages: (sessionId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_SESSION_MESSAGES, sessionId),

  switchSession: (sessionId: string): Promise<ResumeSessionResult> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SWITCH_SESSION, sessionId),

  scanProjects: (): Promise<readonly ProjectInfo[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SCAN_PROJECTS),

  // ── 历史浏览 ──

  getAllSessions: (): Promise<readonly HistoryEntry[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_ALL_SESSIONS),

  searchSessions: (query: string): Promise<readonly HistoryEntry[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SEARCH_SESSIONS, query),

  // ── 设置 ──

  getSettings: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_SETTINGS),

  updateSettings: (settings: Partial<AppPreferences>) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.UPDATE_SETTINGS, settings),

  // ── 项目 ──

  selectDirectory: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SELECT_DIRECTORY),

  notifyProjectSelected: (projectPath: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.NOTIFY_PROJECT_SELECTED, projectPath),

  // ── 文件管理器 ──

  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.LIST_DIRECTORY, dirPath),

  // ── CLI 配置（env 管理） ──

  getEnvVars: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_ENV_VARS),

  setEnvVar: (name: string, value: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SET_ENV_VAR, name, value),

  removeEnvVar: (name: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.REMOVE_ENV_VAR, name),

  // ── Checkpoint ──

  rewindFiles: (sessionId: string, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.CHECKPOINT_REWIND, sessionId, userMessageId, dryRun),

  // ── Phase 3: Plugins ──

  getPlugins: (): Promise<readonly PluginInfo[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_PLUGINS),

  setPluginEnabled: (pluginId: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.SET_PLUGIN_ENABLED, pluginId, enabled),

  // ── Phase 3: Agents & Skills ──

  getAgents: (): Promise<readonly AgentInfo[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_AGENTS),

  getAgentContent: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_AGENT_CONTENT, filePath),

  // ── Phase 3: MCP Servers ──

  getMcpServers: (): Promise<readonly McpServerConfig[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_MCP_SERVERS),

  updateMcpServer: (scope: 'user' | 'project', name: string, config: Omit<McpServerConfig, 'name' | 'scope'>): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.UPDATE_MCP_SERVER, scope, name, config),

  removeMcpServer: (scope: 'user' | 'project', name: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.REMOVE_MCP_SERVER, scope, name),

  // ── Phase 3: CLI Hooks ──

  getCliHooks: (): Promise<CliHooks> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_CLI_HOOKS),

  updateCliHooks: (hooks: CliHooks): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.UPDATE_CLI_HOOKS, hooks),

  // ── Usage 统计 ──

  getUsageStats: (command: UsageCommand): Promise<readonly UsageReport[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_USAGE_STATS, command),

  // ── Phase 3: Memory ──

  getMemoryFiles: (): Promise<readonly MemoryFile[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_MEMORY_FILES),

  getMemoryContent: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_MEMORY_CONTENT, filePath),

  updateMemoryContent: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.UPDATE_MEMORY_CONTENT, filePath, content),

  // ── Git Info ──

  getGitBranch: (projectPath: string): Promise<string | null> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_GIT_BRANCH, projectPath),

  // ── Worktree Management ──

  getWorktrees: (projectPath: string): Promise<readonly WorktreeListEntry[]> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_WORKTREES, projectPath),

  mergeWorktree: (sessionId: string, worktreeBranch: string, baseBranch: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.MERGE_WORKTREE, { sessionId, worktreeBranch, baseBranch }),

  removeWorktree: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.REMOVE_WORKTREE, { sessionId }),

  getWorktreeDiff: (baseBranch: string, worktreeBranch: string): Promise<WorktreeDiffInfo> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.GET_WORKTREE_DIFF, { baseBranch, worktreeBranch }),

  // ── Sync ──

  triggerSync: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.TRIGGER_SYNC),

  // ── 事件監听（返回取消订阅函数） ──

  onClaudeMessage: (callback: (message: Message) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: Message): void => {
      callback(message)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.CLAUDE_MESSAGE, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.CLAUDE_MESSAGE, handler)
    }
  },

  onSessionStatus: (callback: (state: SessionState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SessionState): void => {
      callback(state)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.CLAUDE_STATUS, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.CLAUDE_STATUS, handler)
    }
  },

  onPermissionRequest: (callback: (request: PermissionRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PermissionRequest): void => {
      callback(request)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.PERMISSION_REQUEST, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.PERMISSION_REQUEST, handler)
    }
  },

  onAskUserQuestion: (callback: (request: AskUserQuestionRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: AskUserQuestionRequest): void => {
      callback(request)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.ASK_USER_QUESTION, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.ASK_USER_QUESTION, handler)
    }
  },

  onExitPlanMode: (callback: (request: ExitPlanModeRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: ExitPlanModeRequest): void => {
      callback(request)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.EXIT_PLAN_MODE_REQUEST, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.EXIT_PLAN_MODE_REQUEST, handler)
    }
  },
  onMultiSessionStateChanged: (callback: (state: MultiSessionManagerState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: MultiSessionManagerState): void => {
      callback(state)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.MULTI_SESSION_STATE_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.MULTI_SESSION_STATE_CHANGED, handler)
    }
  },

  onUsageStatsUpdated: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(MAIN_TO_RENDERER.USAGE_STATS_UPDATED, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.USAGE_STATS_UPDATED, handler)
    }
  },

  onSessionMetadata: (callback: (metadata: SessionMetadata) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, metadata: SessionMetadata): void => {
      callback(metadata)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.SESSION_METADATA, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.SESSION_METADATA, handler)
    }
  },

  onSyncCompleted: (callback: (result: import("@common/sync-types").SyncResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: import("@common/sync-types").SyncResult): void => {
      callback(result)
    }
    ipcRenderer.on(MAIN_TO_RENDERER.SYNC_COMPLETED, handler)
    return () => {
      ipcRenderer.removeListener(MAIN_TO_RENDERER.SYNC_COMPLETED, handler)
    }
  },

  // ── Multi-session management ──

  focusSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.FOCUS_SESSION, { sessionId }),

  closeSessionTab: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(RENDERER_TO_MAIN.CLOSE_SESSION_TAB, { sessionId }),
}

contextBridge.exposeInMainWorld("electron", api)
