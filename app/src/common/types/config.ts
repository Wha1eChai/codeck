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
