// ============================================================
// AppPreferencesService — L3: GUI 偏好存储
//
// 存储位置: app.getPath('userData')/preferences.json
// 与 CLI 的 ~/.claude/ 完全隔离。
// ============================================================

import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppPreferences, StructuredOutputConfig } from '@common/types';
import { DEFAULT_APP_PREFERENCES } from '@common/defaults';
import { isRuntimeAvailable } from '@common/runtime-catalog';

export class AppPreferencesService {
    private get filePath(): string {
        return path.join(app.getPath('userData'), 'preferences.json');
    }

    /** Serialised write queue — prevents concurrent read-modify-write races. */
    private writeQueue: Promise<void> = Promise.resolve();

    /**
     * Read preferences, merging with defaults for any missing fields.
     */
    async get(): Promise<AppPreferences> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { ...DEFAULT_APP_PREFERENCES, ...this.sanitise(parsed) };
            }
        } catch {
            // File doesn't exist or invalid JSON — return defaults
        }
        return { ...DEFAULT_APP_PREFERENCES };
    }

    /**
     * Update preferences (partial merge). Writes are serialised to prevent races.
     */
    async update(partial: Partial<AppPreferences>): Promise<void> {
        this.writeQueue = this.writeQueue.then(() => this.doUpdate(partial));
        return this.writeQueue;
    }

    // ── Internal ──

    private async doUpdate(partial: Partial<AppPreferences>): Promise<void> {
        const current = await this.get();
        const merged: AppPreferences = { ...current, ...partial };

        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });

        // Atomic write: tmp file in same directory → rename (avoids EXDEV).
        const tmpPath = path.join(dir, `.preferences-${crypto.randomUUID()}.tmp`);
        try {
            await fs.writeFile(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
            await fs.rename(tmpPath, this.filePath);
        } catch {
            // Fallback: direct write if rename fails.
            try {
                await fs.writeFile(this.filePath, JSON.stringify(merged, null, 2), 'utf-8');
            } finally {
                // Clean up tmp file if it still exists.
                try { await fs.unlink(tmpPath); } catch { /* ignore */ }
            }
        }
    }

    /**
     * Extract only known preference fields with type validation.
     * Unknown or invalid fields are silently dropped.
     */
    private sanitise(raw: Record<string, unknown>): Partial<AppPreferences> {
        return {
            ...(raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'warm' || raw.theme === 'system'
                ? { theme: raw.theme } : {}),
            ...(isValidPermissionMode(raw.defaultPermissionMode)
                ? { defaultPermissionMode: raw.defaultPermissionMode } : {}),
            ...(typeof raw.defaultProjectPath === 'string'
                ? { defaultProjectPath: raw.defaultProjectPath } : {}),
            ...(isRuntimeAvailable(raw.defaultRuntime)
                ? { defaultRuntime: raw.defaultRuntime } : {}),
            ...(typeof raw.checkpointEnabled === 'boolean'
                ? { checkpointEnabled: raw.checkpointEnabled } : {}),
            ...(typeof raw.lastSessionId === 'string'
                ? { lastSessionId: raw.lastSessionId } : {}),
            ...(typeof raw.lastProjectPath === 'string'
                ? { lastProjectPath: raw.lastProjectPath } : {}),
            ...(isValidModelAliases(raw.modelAliases)
                ? { modelAliases: raw.modelAliases } : {}),
            ...(isValidStructuredOutput(raw.structuredOutput)
                ? { structuredOutput: raw.structuredOutput } : {}),
            ...(typeof raw.anthropicApiKey === 'string'
                ? { anthropicApiKey: raw.anthropicApiKey } : {}),
            ...(typeof raw.anthropicBaseUrl === 'string'
                ? { anthropicBaseUrl: raw.anthropicBaseUrl } : {}),
        };
    }
}

function isValidStructuredOutput(v: unknown): v is StructuredOutputConfig {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const obj = v as Record<string, unknown>;
    return typeof obj.enabled === 'boolean'
        && typeof obj.name === 'string'
        && typeof obj.schema === 'string';
}

function isValidModelAliases(v: unknown): v is Readonly<Record<string, string>> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return Object.entries(v as Record<string, unknown>).every(
        ([k, val]) => typeof k === 'string' && k.length > 0 && typeof val === 'string' && val.length > 0,
    );
}

function isValidPermissionMode(v: unknown): v is AppPreferences['defaultPermissionMode'] {
    return (
        v === 'default' ||
        v === 'plan' ||
        v === 'acceptEdits' ||
        v === 'dontAsk' ||
        v === 'bypassPermissions'
    );
}

export const appPreferencesService = new AppPreferencesService();
