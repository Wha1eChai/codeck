import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppPreferencesService } from './app-preferences';
import { DEFAULT_MODEL_ALIASES } from '@common/defaults';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.mock('node:fs/promises');
vi.mock('electron', () => ({
    app: {
        getPath: (key: string) => {
            if (key === 'userData') return '/mock/userData';
            return '';
        },
    },
}));

const PREFS_PATH = path.join('/mock/userData', 'preferences.json');

describe('AppPreferencesService', () => {
    let service: AppPreferencesService;

    beforeEach(() => {
        service = new AppPreferencesService();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('get', () => {
        it('should return defaults when file does not exist', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

            const prefs = await service.get();

            expect(prefs).toEqual({
                theme: 'system',
                defaultPermissionMode: 'default',
                defaultRuntime: 'claude',
                modelAliases: DEFAULT_MODEL_ALIASES,
            });
        });

        it('should return defaults when file contains invalid JSON', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('not-json');

            const prefs = await service.get();

            expect(prefs).toEqual({
                theme: 'system',
                defaultPermissionMode: 'default',
                defaultRuntime: 'claude',
                modelAliases: DEFAULT_MODEL_ALIASES,
            });
        });

        it('should read and merge preferences with defaults', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                theme: 'dark',
                defaultProjectPath: '/some/path',
                checkpointEnabled: false,
            }));

            const prefs = await service.get();

            expect(prefs).toEqual({
                theme: 'dark',
                defaultPermissionMode: 'default',
                defaultRuntime: 'claude',
                defaultProjectPath: '/some/path',
                checkpointEnabled: false,
                modelAliases: DEFAULT_MODEL_ALIASES,
            });
        });

        it('should ignore invalid field values', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                theme: 'invalid-theme',
                defaultPermissionMode: 42,
            }));

            const prefs = await service.get();

            expect(prefs).toEqual({
                theme: 'system',
                defaultPermissionMode: 'default',
                defaultRuntime: 'claude',
                modelAliases: DEFAULT_MODEL_ALIASES,
            });
        });

        it('should fall back to claude when stored runtime is not available', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                defaultRuntime: 'nonexistent-runtime',
            }));

            const prefs = await service.get();

            expect(prefs.defaultRuntime).toBe('claude');
        });

        it('should sanitise valid modelAliases from file', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                modelAliases: { sonnet: 'claude-sonnet-custom', opus: 'claude-opus-custom' },
            }));

            const prefs = await service.get();
            expect(prefs.modelAliases).toEqual({ sonnet: 'claude-sonnet-custom', opus: 'claude-opus-custom' });
        });

        it('should drop invalid modelAliases values', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                modelAliases: { sonnet: 123, opus: '' },
            }));

            const prefs = await service.get();
            // Invalid aliases dropped — defaults used
            expect(prefs.modelAliases).toEqual(DEFAULT_MODEL_ALIASES);
        });
    });

    describe('update', () => {
        it('should merge and write preferences', async () => {
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                theme: 'system',
                defaultPermissionMode: 'default',
            }));
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);
            vi.mocked(fs.rename).mockResolvedValue(undefined);

            await service.update({ theme: 'dark' });

            expect(fs.writeFile).toHaveBeenCalledOnce();
            const writtenContent = JSON.parse(
                vi.mocked(fs.writeFile).mock.calls[0][1] as string,
            );
            expect(writtenContent.theme).toBe('dark');
        });

        it('should persist checkpointEnabled field', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);
            vi.mocked(fs.rename).mockResolvedValue(undefined);

            await service.update({ checkpointEnabled: true });

            const writtenContent = JSON.parse(
                vi.mocked(fs.writeFile).mock.calls[0][1] as string,
            );
            expect(writtenContent.checkpointEnabled).toBe(true);
        });

        it('should serialise concurrent writes', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);
            vi.mocked(fs.rename).mockResolvedValue(undefined);

            // Fire two concurrent updates
            const p1 = service.update({ theme: 'light' });
            const p2 = service.update({ theme: 'dark' });

            await Promise.all([p1, p2]);

            // Both should complete without error — last write wins
            expect(fs.writeFile).toHaveBeenCalledTimes(2);
        });
    });
});
