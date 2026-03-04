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
