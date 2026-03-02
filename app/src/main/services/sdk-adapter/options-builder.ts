// ============================================================
// Options Builder — query() 参数构建器
// ============================================================

import type { ExecutionOptions, HookSettings, PermissionMode } from '@common/types'
import type { SDKCanUseToolCallback, SDKMcpServerConfig, SDKAgentDefinition } from './sdk-types'
import { buildPreToolUseHooks, buildPostToolUseHooks, buildStopHooks } from './hooks-builder'
import type { HookCallbackMatcher, ToolLogEntry, StopLogEntry } from './hooks-builder'
import { resolveModelAlias } from './model-alias-resolver'

export interface SessionParams {
  readonly prompt: string
  readonly cwd: string
  readonly sessionId?: string
  readonly permissionMode: PermissionMode
  readonly env?: Record<string, string>
  readonly resume?: string
  /** Phase 2: SDK execution parameters (model, maxTurns, budget, etc.) */
  readonly executionOptions?: ExecutionOptions
  /** Phase 2: SDK hooks settings (auto-allow, blocked commands) */
  readonly hookSettings?: HookSettings
  /** Phase 2: callback for tool execution logging */
  readonly onToolLog?: (entry: ToolLogEntry) => void
  /** Phase 2: enable SDK file checkpointing (default: true) */
  readonly checkpointEnabled?: boolean
  /** Phase 3: MCP servers loaded from config */
  readonly mcpServers?: Record<string, SDKMcpServerConfig>
  /** Phase 3: callback when session stops */
  readonly onStopLog?: (entry: StopLogEntry) => void
  /** Model alias → full ID mappings from AppPreferences. */
  readonly modelAliases?: Readonly<Record<string, string>>
  /** Phase 4: Agent definitions loaded from config */
  readonly agents?: Record<string, SDKAgentDefinition>
}

export interface QueryArgs {
  readonly prompt: string
  readonly options: {
    readonly cwd: string
    readonly sessionId?: string
    readonly resume?: string
    readonly includePartialMessages?: boolean
    readonly permissionMode: PermissionMode
    readonly canUseTool: SDKCanUseToolCallback
    readonly abortController: AbortController
    readonly env?: Record<string, string>
    readonly persistSession?: boolean
    // Phase 2: execution parameters
    readonly model?: string
    readonly maxTurns?: number
    readonly maxBudgetUsd?: number
    readonly thinking?: { readonly type: 'adaptive' } | { readonly type: 'enabled'; readonly budgetTokens?: number } | { readonly type: 'disabled' }
    readonly effort?: 'low' | 'medium' | 'high' | 'max'
    // Phase 2: hooks
    readonly hooks?: Partial<Record<string, HookCallbackMatcher[]>>
    // Phase 2: file checkpointing
    readonly enableFileCheckpointing?: boolean
    // Phase 3: setting sources (CLI-native loading of agents, CLAUDE.md, etc.)
    readonly settingSources?: ('user' | 'project' | 'local')[]
    // Phase 3: MCP servers
    readonly mcpServers?: Record<string, SDKMcpServerConfig>
    // Phase 4: Agent definitions
    readonly agents?: Record<string, SDKAgentDefinition>
  }
}

/**
 * Build the arguments for the SDK query() call.
 * Phase 1: core fields + env + resume support.
 * Phase 2: execution options + hooks.
 */
export function buildQueryArgs(
  params: SessionParams,
  canUseTool: SDKCanUseToolCallback,
  abortController: AbortController,
): QueryArgs {
  const sessionId = params.resume ? undefined : params.sessionId
  const exec = params.executionOptions

  // Phase 2: build hooks from settings
  const hooks: Partial<Record<string, HookCallbackMatcher[]>> = {}
  if (params.hookSettings) {
    const preHooks = buildPreToolUseHooks(params.hookSettings)
    if (preHooks.length > 0) hooks.PreToolUse = preHooks

    if (params.onToolLog) {
      const postHooks = buildPostToolUseHooks(params.onToolLog)
      if (postHooks.length > 0) hooks.PostToolUse = postHooks
    }
  }

  // Phase 3: Stop hooks
  if (params.onStopLog) {
    const stopHooks = buildStopHooks(params.onStopLog)
    if (stopHooks.length > 0) hooks.Stop = stopHooks
  }

  const hasHooks = Object.keys(hooks).length > 0

  return {
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      ...(sessionId ? { sessionId } : {}),
      ...(params.resume ? { resume: params.resume } : {}),
      includePartialMessages: true,
      permissionMode: params.permissionMode,
      canUseTool,
      abortController,
      env: params.env,
      // SDK-native persistence is the source of truth for session history.
      persistSession: true,
      // Phase 2: execution parameters (only include if provided)
      ...(() => {
        const resolved = resolveModelAlias(exec?.model, params.modelAliases)
        return resolved !== undefined ? { model: resolved } : {}
      })(),
      ...(exec?.maxTurns !== undefined ? { maxTurns: exec.maxTurns } : {}),
      ...(exec?.maxBudgetUsd !== undefined ? { maxBudgetUsd: exec.maxBudgetUsd } : {}),
      ...(exec?.thinking !== undefined ? { thinking: exec.thinking } : {}),
      ...(exec?.effort !== undefined ? { effort: exec.effort } : {}),
      // Phase 2: hooks (only include if any hooks were built)
      ...(hasHooks ? { hooks } : {}),
      // Phase 2: file checkpointing (enabled by default, disabled only when explicitly false)
      ...(params.checkpointEnabled !== false ? { enableFileCheckpointing: true } : {}),
      // Phase 3: CLI-native loading of agents, CLAUDE.md, settings, plugins/skills
      settingSources: ['user', 'project'],
      // Phase 3: MCP servers (only include if non-empty)
      ...(params.mcpServers && Object.keys(params.mcpServers).length > 0 ? { mcpServers: params.mcpServers } : {}),
      // Phase 4: Agent definitions (only include if non-empty)
      ...(params.agents && Object.keys(params.agents).length > 0 ? { agents: params.agents } : {}),
    },
  }
}
