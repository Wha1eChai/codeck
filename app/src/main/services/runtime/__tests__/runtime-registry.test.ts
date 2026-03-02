import { describe, it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { PermissionResponse } from '@common/types';
import { RuntimeRegistry } from '../runtime-registry';
import type { RuntimeAdapter } from '../types';

function createCodexAdapterMock(): RuntimeAdapter {
  return {
    id: 'codex',
    getCapabilities: () => ({
      runtime: 'codex',
      supports: {
        resume: true,
        permissionPrompt: false,
        streamDelta: true,
        nativeFileHistory: false,
      },
      supportedPermissionModes: ['default', 'plan'],
      notes: ['test adapter'],
    }),
    startSession: vi.fn(async () => undefined),
    abort: vi.fn(),
    resetSession: vi.fn(),
    setResumeSessionId: vi.fn(),
    resolvePermission: vi.fn(),
  };
}

describe('RuntimeRegistry', () => {
  it('should expose claude runtime by default', () => {
    const registry = new RuntimeRegistry();

    expect(registry.getActiveRuntime()).toBe('claude');
    expect(registry.listRuntimes()).toContain('claude');
  });

  it('should switch to a registered runtime', () => {
    const registry = new RuntimeRegistry();
    const codex = createCodexAdapterMock();

    registry.register(codex);
    registry.setActiveRuntime('codex');

    expect(registry.getActiveRuntime()).toBe('codex');
    expect(registry.getCapabilities().runtime).toBe('codex');
  });

  it('should throw when setting an unregistered runtime', () => {
    const registry = new RuntimeRegistry();
    expect(() => registry.setActiveRuntime('opencode')).toThrow('Runtime adapter not registered');
  });

  it('should delegate lifecycle calls to active adapter', async () => {
    const registry = new RuntimeRegistry();
    const codex = createCodexAdapterMock();
    registry.register(codex);
    registry.setActiveRuntime('codex');

    const window = {} as BrowserWindow;
    await registry.startSession(window, {
      prompt: 'hello',
      cwd: '/tmp/project',
      sessionId: 's1',
      permissionMode: 'default',
    });
    registry.abort();
    registry.resetSession();
    registry.setResumeSessionId('sdk-session-1');
    registry.resolvePermission({ requestId: 'r1', allowed: true } satisfies PermissionResponse);

    expect(codex.startSession).toHaveBeenCalledOnce();
    expect(codex.abort).toHaveBeenCalledOnce();
    expect(codex.resetSession).toHaveBeenCalledOnce();
    expect(codex.setResumeSessionId).toHaveBeenCalledWith('sdk-session-1');
    expect(codex.resolvePermission).toHaveBeenCalledOnce();
  });
});
