// ============================================================
// Hooks Builder — SDK hooks 构建器（Phase 2）
// ============================================================

import type { HookSettings } from '@common/types'

// ── Read-only tools that are safe to auto-allow ──

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'LS', 'ListDir'])

// ── Types ──

/** Subset of SDK PreToolUseHookInput we care about */
interface PreToolInput {
    readonly hook_event_name: 'PreToolUse'
    readonly tool_name: string
    readonly tool_input: Record<string, unknown>
    readonly tool_use_id: string
}

/** Subset of SDK PostToolUseHookInput we care about */
interface PostToolInput {
    readonly hook_event_name: 'PostToolUse'
    readonly tool_name: string
    readonly tool_use_id: string
    readonly tool_response?: unknown
}

/** Entry emitted by the PostToolUse hook for logging */
export interface ToolLogEntry {
    readonly tool: string
    readonly toolUseId: string
    readonly timestamp: number
    readonly error?: boolean
}

/** SDK HookCallbackMatcher mirror */
export interface HookCallbackMatcher {
    matcher?: string
    hooks: Array<(input: Record<string, unknown>, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<Record<string, unknown>>>
    timeout?: number
}

// ── PreToolUse Hook Builder ──

/**
 * Build PreToolUse hook matchers.
 *
 * - If `autoAllowReadOnly`, Read/Glob/LS/ListDir → `permissionDecision: 'allow'`
 * - If `blockedCommands` contains patterns, Bash commands matching → `permissionDecision: 'deny'`
 * - Otherwise → `{ continue: true }` (transparent pass-through)
 */
export function buildPreToolUseHooks(settings: HookSettings): HookCallbackMatcher[] {
    const hooks: HookCallbackMatcher[] = []

    // Auto-allow read-only tools
    if (settings.autoAllowReadOnly) {
        hooks.push({
            hooks: [async (input: Record<string, unknown>) => {
                const typed = input as unknown as PreToolInput
                if (READ_ONLY_TOOLS.has(typed.tool_name)) {
                    return {
                        hookEventName: 'PreToolUse',
                        permissionDecision: 'allow' as const,
                        permissionDecisionReason: 'Auto-allowed read-only tool',
                    }
                }
                return { continue: true }
            }],
        })
    }

    // Auto-deny blocked commands
    const patterns = settings.blockedCommands.filter(p => p.trim().length > 0)
    if (patterns.length > 0) {
        hooks.push({
            matcher: 'Bash',
            hooks: [async (input: Record<string, unknown>) => {
                const typed = input as unknown as PreToolInput
                const command = typeof typed.tool_input?.command === 'string'
                    ? typed.tool_input.command
                    : ''

                for (const pattern of patterns) {
                    if (command.includes(pattern.trim())) {
                        return {
                            hookEventName: 'PreToolUse',
                            permissionDecision: 'deny' as const,
                            permissionDecisionReason: `Blocked by rule: "${pattern.trim()}"`,
                        }
                    }
                }
                return { continue: true }
            }],
        })
    }

    return hooks
}

// ── PostToolUse Hook Builder ──

/**
 * Build PostToolUse hook matchers that log tool execution.
 */
export function buildPostToolUseHooks(
    onLog: (entry: ToolLogEntry) => void,
): HookCallbackMatcher[] {
    return [{
        hooks: [async (input: Record<string, unknown>) => {
            const typed = input as unknown as PostToolInput
            onLog({
                tool: typed.tool_name,
                toolUseId: typed.tool_use_id,
                timestamp: Date.now(),
                error: false,
            })
            return {
                hookEventName: 'PostToolUse',
            }
        }],
    }]
}

// ── Stop Hook Builder ──

/** Subset of SDK StopHookInput we care about */
interface StopInput {
    readonly hook_event_name: 'Stop'
    readonly stop_hook_active: boolean
    readonly last_assistant_message?: string
}

/** Entry emitted by the Stop hook */
export interface StopLogEntry {
    readonly timestamp: number
    readonly lastAssistantMessage?: string
}

/**
 * Build Stop hook matchers that fire when the session ends.
 */
export function buildStopHooks(
    onStop: (entry: StopLogEntry) => void,
): HookCallbackMatcher[] {
    return [{
        hooks: [async (input: Record<string, unknown>) => {
            const typed = input as unknown as StopInput
            onStop({
                timestamp: Date.now(),
                lastAssistantMessage: typed.last_assistant_message,
            })
            return { hookEventName: 'Stop' }
        }],
    }]
}
