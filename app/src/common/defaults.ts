// ============================================================
// 共享默认值 — 单一真相源（main + renderer 两侧共用）
// ============================================================

import type { AppPreferences } from './types';
import type { ExecutionOptions, HookSettings } from './types';

/** Default model alias → full model ID mappings (2026-02). */
export const DEFAULT_MODEL_ALIASES: Readonly<Record<string, string>> = {
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
    haiku: 'claude-haiku-4-5-20251001',
} as const;

/** Default application preferences (L3: GUI-only, stored in userData). */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
    theme: 'system',
    defaultPermissionMode: 'default',
    defaultRuntime: 'claude',
    modelAliases: DEFAULT_MODEL_ALIASES,
};

/** Default SDK execution parameters (L2: in-memory per session). */
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {};

/** Default SDK hook settings (L2: in-memory per session). */
export const DEFAULT_HOOK_SETTINGS: HookSettings = {
    autoAllowReadOnly: false,
    blockedCommands: [],
};
