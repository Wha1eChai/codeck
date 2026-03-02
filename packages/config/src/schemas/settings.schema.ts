import { z } from 'zod'

// ── Hook types ──

export const hookEventTypes = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentTool',
  'TaskCompleted',
  'TeammateIdle',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'UserPromptSubmit',
] as const

export type HookEventType = (typeof hookEventTypes)[number]

export const hookEntrySchema = z
  .object({
    type: z.literal('command'),
    command: z.string(),
    timeout: z.number().optional(),
    timeout_ms: z.number().optional(),
    statusMessage: z.string().optional(),
    async: z.boolean().optional(),
    description: z.string().optional(),
  })
  .passthrough()

export type HookEntry = z.infer<typeof hookEntrySchema>

export const hookRuleSchema = z
  .object({
    matcher: z.string(),
    hooks: z.array(hookEntrySchema),
    description: z.string().optional(),
  })
  .passthrough()

export type HookRule = z.infer<typeof hookRuleSchema>

export const hooksMapSchema = z.record(z.string(), z.array(hookRuleSchema))

export type HooksMap = z.infer<typeof hooksMapSchema>

// ── Permission types ──

export const permissionModeSchema = z.enum([
  'default',
  'plan',
  'acceptEdits',
  'delegate',
  'dontAsk',
  'bypassPermissions',
])

export type PermissionMode = z.infer<typeof permissionModeSchema>

export const permissionsSchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    ask: z.array(z.string()).optional(),
    defaultMode: permissionModeSchema.optional(),
  })
  .passthrough()

export type Permissions = z.infer<typeof permissionsSchema>

// ── MCP Server config ──

export const mcpServerConfigSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    type: z.string().optional(),
  })
  .passthrough()

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>

// ── Enabled plugins (supports both formats) ──

/** New format: Record<string, boolean> */
const enabledPluginsRecordSchema = z.record(z.string(), z.boolean())

/** Old format: string[] */
const enabledPluginsArraySchema = z.array(z.string())

export const enabledPluginsSchema = z.union([
  enabledPluginsRecordSchema,
  enabledPluginsArraySchema,
])

export type EnabledPlugins = z.infer<typeof enabledPluginsSchema>

/**
 * Normalize enabledPlugins to Record<string, boolean> regardless of input format.
 */
export function normalizeEnabledPlugins(
  value: EnabledPlugins | undefined,
): Record<string, boolean> {
  if (value === undefined) return {}
  if (Array.isArray(value)) {
    const result: Record<string, boolean> = {}
    for (const id of value) {
      result[id] = true
    }
    return result
  }
  return { ...value }
}

// ── Main settings schema ──

export const claudeSettingsSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    permissions: permissionsSchema.optional(),
    hooks: hooksMapSchema.optional(),
    enabledPlugins: enabledPluginsSchema.optional(),
    mcpServers: z.record(z.string(), mcpServerConfigSchema).optional(),
    language: z.string().optional(),
    model: z.string().optional(),
    skipDangerousModePermissionPrompt: z.boolean().optional(),
  })
  .passthrough()

export type ClaudeSettings = z.infer<typeof claudeSettingsSchema>

// ── Settings scope ──

export type SettingsScope = 'user' | 'project' | 'local'
