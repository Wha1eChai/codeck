// ============================================================
// IPC 频道常量 — 主进程与渲染进程的类型安全通信契约
// ============================================================

/** 主进程 → 渲染进程（单向推送） */
export const MAIN_TO_RENDERER = {
  /** Claude 流式消息推送 */
  CLAUDE_MESSAGE: "claude:message",
  /** Claude 会话状态变更 */
  CLAUDE_STATUS: "claude:status",
  /** 权限审批请求 */
  PERMISSION_REQUEST: "claude:permission-request",
  /** AskUserQuestion 交互请求 */
  ASK_USER_QUESTION: "claude:ask-user-question",
  /** ExitPlanMode 计划审批请求 */
  EXIT_PLAN_MODE_REQUEST: "claude:exit-plan-mode",
  /** 会话管理器状态变更（单 session 兼容） */
  SESSION_STATE_CHANGED: "session:state-changed",
  /** 多 session 状态变更（完整 map） */
  MULTI_SESSION_STATE_CHANGED: "session:multi-state-changed",
  /** Usage 缓存刷新完成通知（无 payload） */
  USAGE_STATS_UPDATED: "usage:stats-updated",
  /** Sessions-server sync 完成通知 */
  SYNC_COMPLETED: "history:sync-completed",
  /** SDK system/init 会话元数据推送 */
  SESSION_METADATA: "session:metadata",
} as const

/** 渲染进程 → 主进程（invoke 调用） */
export const RENDERER_TO_MAIN = {
  /** 发送用户消息 */
  SEND_MESSAGE: "claude:send-message",
  /** 中断当前对话 */
  ABORT: "claude:abort",
  /** 权限审批响应 */
  PERMISSION_RESPONSE: "claude:permission-response",
  /** AskUserQuestion 用户回复 */
  ASK_USER_QUESTION_RESPONSE: "claude:ask-user-question-response",
  /** ExitPlanMode 用户选择回复 */
  EXIT_PLAN_MODE_RESPONSE: "claude:exit-plan-mode-response",

  /** 获取会话列表 */
  GET_SESSIONS: "session:get-list",
  /** 创建新会话 */
  CREATE_SESSION: "session:create",
  /** 恢复已有会话 */
  RESUME_SESSION: "session:resume",
  /** 删除会话 */
  DELETE_SESSION: "session:delete",
  /** 获取会话历史消息 */
  GET_SESSION_MESSAGES: "session:get-messages",

  /** 读取用户设置 */
  GET_SETTINGS: "settings:get",
  /** 更新用户设置 */
  UPDATE_SETTINGS: "settings:update",

  /** 选择项目目录 */
  SELECT_DIRECTORY: "dialog:select-directory",

  /** 切换会话（abort 当前 + resume 目标） */
  SWITCH_SESSION: "session:switch",
  /** 扫描已有项目 */
  SCAN_PROJECTS: "session:scan-projects",
  /** 获取全局 session 历史列表 */
  GET_ALL_SESSIONS: "history:get-all",
  /** 搜索 session 历史 */
  SEARCH_SESSIONS: "history:search",
  /** 通知后端项目已选择（手动输入时） */
  NOTIFY_PROJECT_SELECTED: "session:notify-project",

  /** Phase 2: checkpoint — 回滚文件到指定消息 */
  CHECKPOINT_REWIND: "checkpoint:rewind",

  /** List directory contents for file explorer */
  LIST_DIRECTORY: "fs:list-directory",

  /** 读取 CLI env 配置 */
  GET_ENV_VARS: "cli-config:get-env",
  /** 设置 CLI env 变量 */
  SET_ENV_VAR: "cli-config:set-env",
  /** 删除 CLI env 变量 */
  REMOVE_ENV_VAR: "cli-config:remove-env",

  /** Phase 3: Plugins */
  GET_PLUGINS: "plugins:get-all",
  SET_PLUGIN_ENABLED: "plugins:set-enabled",

  /** Phase 3: Agents & Skills */
  GET_AGENTS: "agents:get-all",
  GET_AGENT_CONTENT: "agents:get-content",

  /** Phase 3: MCP Servers */
  GET_MCP_SERVERS: "mcp:get-servers",
  UPDATE_MCP_SERVER: "mcp:update-server",
  REMOVE_MCP_SERVER: "mcp:remove-server",

  /** Phase 3: CLI Hooks */
  GET_CLI_HOOKS: "cli-config:get-hooks",
  UPDATE_CLI_HOOKS: "cli-config:update-hooks",

  /** Usage 统计（ccusage） */
  GET_USAGE_STATS: "usage:get-stats",

  /** Phase 3: Memory */
  GET_MEMORY_FILES: "memory:get-files",
  GET_MEMORY_CONTENT: "memory:get-content",
  UPDATE_MEMORY_CONTENT: "memory:update-content",

  /** 中断指定 session（带 sessionId） */
  ABORT_SESSION: "claude:abort-session",
  /** 切换 focused session */
  FOCUS_SESSION: "session:focus",
  /** 关闭 session tab */
  CLOSE_SESSION_TAB: "session:close-tab",

  /** Git info */
  GET_GIT_BRANCH: "git:get-branch",

  /** 触发 sessions-server 增量同步 */
  TRIGGER_SYNC: "history:trigger-sync",

  /** Worktree management */
  GET_WORKTREES: "worktree:get-list",
  MERGE_WORKTREE: "worktree:merge",
  REMOVE_WORKTREE: "worktree:remove",
  GET_WORKTREE_DIFF: "worktree:get-diff",
} as const

/** 从常量对象提取值类型 */
export type MainToRendererChannel =
  (typeof MAIN_TO_RENDERER)[keyof typeof MAIN_TO_RENDERER]

export type RendererToMainChannel =
  (typeof RENDERER_TO_MAIN)[keyof typeof RENDERER_TO_MAIN]
