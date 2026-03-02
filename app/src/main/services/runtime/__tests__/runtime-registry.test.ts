import { describe, it, expect } from 'vitest';
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
        checkpointing: false,
        hooks: false,
        modelSelection: false,
        embeddedTerminal: false,
      },
      supportedPermissionModes: ['default', 'plan'],
      notes: ['test adapter'],
    }),
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

  it('should list all registered runtimes', () => {
    const registry = new RuntimeRegistry();
    const codex = createCodexAdapterMock();
    registry.register(codex);

    const runtimes = registry.listRuntimes();
    expect(runtimes).toContain('claude');
    expect(runtimes).toContain('codex');
  });
});
