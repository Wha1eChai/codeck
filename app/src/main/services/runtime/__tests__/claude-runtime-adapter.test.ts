import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';
import { ClaudeRuntimeAdapter } from '../claude-runtime-adapter';
import { claudeService } from '../../claude';

vi.mock('../../claude', () => ({
  claudeService: {
    startSession: vi.fn(async () => undefined),
    abort: vi.fn(),
    resetSession: vi.fn(),
    setSDKSessionId: vi.fn(),
    resolvePermission: vi.fn(),
  },
}));

describe('ClaudeRuntimeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report expected capabilities', () => {
    const adapter = new ClaudeRuntimeAdapter();
    const capabilities = adapter.getCapabilities();

    expect(capabilities.runtime).toBe('claude');
    expect(capabilities.supports.resume).toBe(true);
    expect(capabilities.supports.permissionPrompt).toBe(true);
    expect(capabilities.supportedPermissionModes).toContain('default');
    expect(capabilities.supportedPermissionModes).toContain('bypassPermissions');
  });

  it('should proxy runtime operations to ClaudeService', async () => {
    const adapter = new ClaudeRuntimeAdapter();
    const window = {} as BrowserWindow;

    await adapter.startSession(window, {
      prompt: 'build adapter contract',
      cwd: '/tmp/workspace',
      sessionId: 'session-1',
      permissionMode: 'default',
    });
    adapter.abort();
    adapter.resetSession();
    adapter.setResumeSessionId('sdk-session-1');
    adapter.resolvePermission({ requestId: 'perm-1', allowed: true });

    expect(claudeService.startSession).toHaveBeenCalledOnce();
    expect(claudeService.abort).toHaveBeenCalledOnce();
    expect(claudeService.resetSession).toHaveBeenCalledOnce();
    expect(claudeService.setSDKSessionId).toHaveBeenCalledWith('sdk-session-1');
    expect(claudeService.resolvePermission).toHaveBeenCalledOnce();
  });
});
