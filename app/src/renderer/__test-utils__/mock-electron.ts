// ============================================================
// Mock Electron API — window.electron mock 工厂
// ============================================================

import { vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '@common/defaults'

/**
 * Create a fully mocked ElectronAPI object.
 * All methods are vi.fn() with sensible defaults.
 */
export function createMockElectron() {
  return {
    // Claude 交互
    sendMessage: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    respondPermission: vi.fn().mockResolvedValue(undefined),
    respondAskUserQuestion: vi.fn().mockResolvedValue(undefined),
    respondExitPlanMode: vi.fn().mockResolvedValue(undefined),

    // 会话管理
    getSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({
      id: 'mock-session-id',
      name: 'Mock Session',
      projectPath: '/mock/project',
      runtime: 'claude' as const,
      permissionMode: 'default' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    resumeSession: vi.fn().mockResolvedValue({ success: true, session: null, messages: [] }),
    switchSession: vi.fn().mockResolvedValue({ success: true, session: null, messages: [] }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    getSessionMessages: vi.fn().mockResolvedValue([]),
    scanProjects: vi.fn().mockResolvedValue([]),

    // 历史浏览
    getAllSessions: vi.fn().mockResolvedValue([]),
    searchSessions: vi.fn().mockResolvedValue([]),

    // Checkpoint
    rewindFiles: vi.fn().mockResolvedValue({ canRewind: false }),

    // 设置
    getSettings: vi.fn().mockResolvedValue(DEFAULT_APP_PREFERENCES),
    updateSettings: vi.fn().mockResolvedValue(undefined),

    // 项目
    selectDirectory: vi.fn().mockResolvedValue(null),
    notifyProjectSelected: vi.fn().mockResolvedValue(undefined),

    // 文件管理器
    listDirectory: vi.fn().mockResolvedValue([]),

    // CLI 配置（env 管理）
    getEnvVars: vi.fn().mockResolvedValue({}),
    setEnvVar: vi.fn().mockResolvedValue(undefined),
    removeEnvVar: vi.fn().mockResolvedValue(undefined),

    // Plugins
    getPlugins: vi.fn().mockResolvedValue([]),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),

    // Agents & Skills
    getAgents: vi.fn().mockResolvedValue([]),
    getAgentContent: vi.fn().mockResolvedValue(''),

    // MCP Servers
    getMcpServers: vi.fn().mockResolvedValue([]),
    updateMcpServer: vi.fn().mockResolvedValue(undefined),
    removeMcpServer: vi.fn().mockResolvedValue(undefined),

    // CLI Hooks
    getCliHooks: vi.fn().mockResolvedValue({}),
    updateCliHooks: vi.fn().mockResolvedValue(undefined),

    // Usage 统计
    getUsageStats: vi.fn().mockResolvedValue([]),

    // Memory
    getMemoryFiles: vi.fn().mockResolvedValue([]),
    getMemoryContent: vi.fn().mockResolvedValue(''),
    updateMemoryContent: vi.fn().mockResolvedValue(undefined),

    // Git info
    getGitBranch: vi.fn().mockResolvedValue(null),

    // Worktree management
    getWorktrees: vi.fn().mockResolvedValue([]),
    mergeWorktree: vi.fn().mockResolvedValue({ success: true }),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    getWorktreeDiff: vi.fn().mockResolvedValue({ files: [], insertions: 0, deletions: 0, diff: '' }),

    // Sync
    triggerSync: vi.fn().mockResolvedValue(null),

    // 事件监听 (return unsubscribe functions)
    onClaudeMessage: vi.fn().mockReturnValue(vi.fn()),
    onSessionStatus: vi.fn().mockReturnValue(vi.fn()),
    onPermissionRequest: vi.fn().mockReturnValue(vi.fn()),
    onAskUserQuestion: vi.fn().mockReturnValue(vi.fn()),
    onExitPlanMode: vi.fn().mockReturnValue(vi.fn()),
    onMultiSessionStateChanged: vi.fn().mockReturnValue(vi.fn()),
    onUsageStatsUpdated: vi.fn().mockReturnValue(vi.fn()),
    onSyncCompleted: vi.fn().mockReturnValue(vi.fn()),

    // Multi-session management
    focusSession: vi.fn().mockResolvedValue(undefined),
    closeSessionTab: vi.fn().mockResolvedValue(undefined),
  }
}

export type MockElectronAPI = ReturnType<typeof createMockElectron>

/**
 * Install mock electron on globalThis.window.
 * Returns the mock for assertions.
 */
export function installMockElectron(): MockElectronAPI {
  const mock = createMockElectron()
  ;(globalThis as Record<string, unknown>).window = {
    ...(typeof globalThis.window === 'object' ? globalThis.window : {}),
    electron: mock,
  }
  return mock
}

/**
 * Remove mock electron from globalThis.window.
 */
export function uninstallMockElectron(): void {
  if (typeof globalThis.window === 'object' && globalThis.window) {
    delete (globalThis.window as Record<string, unknown>).electron
  }
}
