import { z } from 'zod';

// ── Shared Enum Schemas ──

export const permissionModeSchema = z.enum([
    'default',
    'plan',
    'acceptEdits',
    'dontAsk',
    'bypassPermissions',
]);

export const runtimeProviderSchema = z.enum(['claude', 'codex', 'opencode', 'kernel']);

// ── Effort Level Schema ──

export const effortLevelSchema = z.enum(['low', 'medium', 'high', 'max']);

// ── Thinking Config Schema ──

export const thinkingConfigSchema = z.union([
    z.object({ type: z.literal('adaptive') }),
    z.object({ type: z.literal('enabled'), budgetTokens: z.number().int().positive().optional() }),
    z.object({ type: z.literal('disabled') }),
]);

// ── Execution Options Schema ──

export const executionOptionsSchema = z.object({
    model: z.string().optional(),
    maxTurns: z.number().int().positive().optional(),
    maxBudgetUsd: z.number().positive().optional(),
    thinking: thinkingConfigSchema.optional(),
    effort: effortLevelSchema.optional(),
});

// ── Hook Settings Schema ──

export const hookSettingsSchema = z.object({
    autoAllowReadOnly: z.boolean(),
    blockedCommands: z.array(z.string()),
});

// ── Input Schemas ──

export const sendMessageSchema = z.object({
    sessionId: z.string(),
    content: z.string().min(1, 'Message content is required').max(100000, 'Message too long'),
    permissionMode: permissionModeSchema.optional(),
    executionOptions: executionOptionsSchema.optional(),
    hookSettings: hookSettingsSchema.optional(),
});

export const createSessionSchema = z.object({
    name: z.string().min(1),
    projectPath: z.string().min(1),
    runtime: runtimeProviderSchema.optional(),
    permissionMode: permissionModeSchema,
    useWorktree: z.boolean().optional(),
});

export const permissionResponseSchema = z.object({
    requestId: z.string(),
    allowed: z.boolean(),
    reason: z.string().optional(),
    rememberForSession: z.boolean().optional(),
    rememberScope: z.enum(['input', 'tool']).optional(),
});

export const structuredOutputConfigSchema = z.object({
    enabled: z.boolean(),
    name: z.string(),
    description: z.string().optional(),
    schema: z.string(),
});

export const updatePreferencesSchema = z.object({
    theme: z.enum(['light', 'dark', 'warm', 'system']).optional(),
    defaultPermissionMode: permissionModeSchema.optional(),
    defaultProjectPath: z.string().optional(),
    defaultRuntime: runtimeProviderSchema.optional(),
    checkpointEnabled: z.boolean().optional(),
    modelAliases: z.record(z.string().min(1), z.string().min(1)).optional(),
    structuredOutput: structuredOutputConfigSchema.optional(),
});

export const sessionIdSchema = z.string().min(1, 'Session ID is required');

export const askUserQuestionResponseSchema = z.object({
  requestId: z.string(),
  answers: z.record(z.string(), z.string()),
  cancelled: z.boolean(),
});

export const exitPlanModeResponseSchema = z.object({
  requestId: z.string(),
  allowed: z.boolean(),
  feedback: z.string().optional(),
});

// ── Multi-Session Schemas ──

export const abortSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const focusSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const closeSessionTabSchema = z.object({
  sessionId: z.string().min(1),
});

// ── Worktree Schemas ──

export const mergeWorktreeSchema = z.object({
  sessionId: z.string().min(1),
  worktreeBranch: z.string().min(1),
  baseBranch: z.string().min(1),
});

export const removeWorktreeSchema = z.object({
  sessionId: z.string().min(1),
});

export const getWorktreeDiffSchema = z.object({
  baseBranch: z.string().min(1),
  worktreeBranch: z.string().min(1),
});
