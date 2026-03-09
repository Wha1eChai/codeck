import { describe, it, expect, vi } from 'vitest';
import { RuntimeRegistry } from '../runtime-registry';
import type { RuntimeAdapter } from '../types';

function createClaudeAdapterMock(): RuntimeAdapter {
  return {
    id: 'claude',
    getCapabilities: () => ({
      runtime: 'claude',
      supports: {
        resume: true,
        permissionPrompt: true,
        streamDelta: true,
        nativeFileHistory: true,
        checkpointing: true,
        hooks: true,
        modelSelection: true,
        embeddedTerminal: true,
        teamTools: false,
      },
      supportedPermissionModes: ['default', 'plan', 'acceptEdits', 'dontAsk', 'bypassPermissions'],
    }),
    startSession: vi.fn(),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
    resolveAskUserQuestion: vi.fn(),
    resolveExitPlanMode: vi.fn(),
    rewindFiles: vi.fn(),
  };
}

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
        checkpointing: false,
        hooks: false,
        modelSelection: false,
        embeddedTerminal: false,
        teamTools: false,
      },
      supportedPermissionModes: ['default', 'plan'],
      notes: ['test adapter'],
    }),
    startSession: vi.fn(),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
    resolveAskUserQuestion: vi.fn(),
    resolveExitPlanMode: vi.fn(),
    rewindFiles: vi.fn(),
  };
}

describe('RuntimeRegistry', () => {
  it('should default to claude active runtime', () => {
    const registry = new RuntimeRegistry();
    expect(registry.getActiveRuntime()).toBe('claude');
  });

  it('should register and retrieve adapter via getAdapter()', () => {
    const registry = new RuntimeRegistry();
    const claude = createClaudeAdapterMock();
    registry.register(claude);

    const adapter = registry.getAdapter('claude');
    expect(adapter.id).toBe('claude');
  });

  it('should return active adapter when no id passed to getAdapter()', () => {
    const registry = new RuntimeRegistry();
    const claude = createClaudeAdapterMock();
    registry.register(claude);

    const adapter = registry.getAdapter();
    expect(adapter.id).toBe('claude');
  });

  it('should throw from getAdapter() for unregistered runtime', () => {
    const registry = new RuntimeRegistry();
    expect(() => registry.getAdapter('opencode')).toThrow('Runtime adapter not registered');
  });

  it('should switch to a registered runtime', () => {
    const registry = new RuntimeRegistry();
    const claude = createClaudeAdapterMock();
    const codex = createCodexAdapterMock();
    registry.register(claude);
    registry.register(codex);
    registry.setActiveRuntime('codex');

    expect(registry.getActiveRuntime()).toBe('codex');
    expect(registry.getCapabilities().runtime).toBe('codex');
  });

  it('should throw when setting an unregistered runtime', () => {
    const registry = new RuntimeRegistry();
    expect(() => registry.setActiveRuntime('opencode')).toThrow('Runtime adapter not registered');
  });

  it('should list all registered runtimes', () => {
    const registry = new RuntimeRegistry();
    const claude = createClaudeAdapterMock();
    const codex = createCodexAdapterMock();
    registry.register(claude);
    registry.register(codex);

    const runtimes = registry.listRuntimes();
    expect(runtimes).toContain('claude');
    expect(runtimes).toContain('codex');
  });

  it('should delegate getCapabilities to getAdapter', () => {
    const registry = new RuntimeRegistry();
    const claude = createClaudeAdapterMock();
    registry.register(claude);

    const caps = registry.getCapabilities();
    expect(caps.runtime).toBe('claude');
    expect(caps.supports.resume).toBe(true);
  });
});
