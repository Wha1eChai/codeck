import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeContextService } from '../runtime-context';
import { appPreferencesService } from '../app-preferences';

vi.mock('../app-preferences', () => ({
  appPreferencesService: {
    get: vi.fn(),
  },
}));

describe('RuntimeContextService', () => {
  let service: RuntimeContextService;

  beforeEach(() => {
    service = new RuntimeContextService();
    vi.clearAllMocks();
  });

  it('prefers request runtime and permission mode when provided', async () => {
    vi.mocked(appPreferencesService.get).mockResolvedValue({
      theme: 'system',
      defaultPermissionMode: 'default',
      defaultRuntime: 'claude',
    });

    const context = await service.buildContext({
      projectPath: '/project',
      sessionId: 'session-1',
      runtime: 'opencode',
      permissionMode: 'plan',
    });

    expect(context.runtime).toBe('opencode');
    expect(context.permissionMode).toBe('plan');
    expect(context.sources).toEqual({
      runtime: 'request',
      permissionMode: 'request',
    });
  });

  it('uses user preferences when request does not override runtime or permission mode', async () => {
    vi.mocked(appPreferencesService.get).mockResolvedValue({
      theme: 'dark',
      defaultPermissionMode: 'acceptEdits',
      defaultRuntime: 'codex',
    });

    const context = await service.buildContext({
      projectPath: '/project',
    });

    expect(context.runtime).toBe('codex');
    expect(context.permissionMode).toBe('acceptEdits');
    expect(context.sources).toEqual({
      runtime: 'userSettings',
      permissionMode: 'userSettings',
    });
  });

  it('falls back to claude runtime when user preferences do not specify runtime', async () => {
    vi.mocked(appPreferencesService.get).mockResolvedValue({
      theme: 'light',
      defaultPermissionMode: 'default',
    });

    const context = await service.buildContext({
      projectPath: '/project',
    });

    expect(context.runtime).toBe('claude');
    expect(context.sources.runtime).toBe('fallback');
  });
});
