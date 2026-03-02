/**
 * UI-friendly flat types for rendering in Electron/React.
 *
 * These match the interfaces used by codeck's common/types.ts,
 * enabling smooth migration from hand-rolled services to cc-desk-config.
 */

export interface PluginInfo {
  readonly id: string
  readonly marketplace: string
  readonly version: string
  readonly installedAt: string
  readonly lastUpdated: string
  readonly enabled: boolean
}

export interface AgentInfo {
  readonly filename: string
  readonly name: string
  readonly description?: string | undefined
  readonly scope: 'user' | 'project'
}

export interface SkillInfo {
  readonly name: string
  readonly source: string
}

export interface McpServerInfo {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>> | undefined
  readonly scope: 'user' | 'project'
}

export interface MemoryFileInfo {
  readonly path: string
  readonly name: string
  readonly scope: 'user-global' | 'project' | 'project-memory'
  readonly content?: string | undefined
}

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
  readonly timeout?: number | undefined
  readonly timeout_ms?: number | undefined
  readonly statusMessage?: string | undefined
  readonly async?: boolean | undefined
  readonly description?: string | undefined
}

export interface CliHookRule {
  readonly matcher: string
  readonly hooks: readonly CliHookEntry[]
  readonly description?: string | undefined
}

export type CliHooks = Readonly<Record<string, readonly CliHookRule[]>>
