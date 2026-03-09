import { describe, expect, it } from 'vitest';
import { CapabilityGate } from '../capability-gate';

describe('CapabilityGate', () => {
  const gate = new CapabilityGate();

  it('allows context when permission mode is supported', () => {
    const result = gate.evaluate(
      {
        runtime: 'claude',
        projectPath: '/project',
        permissionMode: 'default',
        settings: {
          theme: 'system',
          defaultPermissionMode: 'default',
          defaultRuntime: 'claude',
        },
        sources: {
          runtime: 'request',
          permissionMode: 'request',
        },
      },
      {
        runtime: 'claude',
        supports: {
          resume: true,
          permissionPrompt: true,
          streamDelta: true,
          nativeFileHistory: true,
          checkpointing: false,
          hooks: false,
          modelSelection: false,
          embeddedTerminal: false,
          teamTools: false,
        },
        supportedPermissionModes: ['default', 'plan'],
      },
    );

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('denies context when permission mode is unsupported', () => {
    const result = gate.evaluate(
      {
        runtime: 'claude',
        projectPath: '/project',
        permissionMode: 'bypassPermissions',
        settings: {
          theme: 'system',
          defaultPermissionMode: 'bypassPermissions',
          defaultRuntime: 'claude',
        },
        sources: {
          runtime: 'request',
          permissionMode: 'request',
        },
      },
      {
        runtime: 'claude',
        supports: {
          resume: true,
          permissionPrompt: true,
          streamDelta: true,
          nativeFileHistory: true,
          checkpointing: false,
          hooks: false,
          modelSelection: false,
          embeddedTerminal: false,
          teamTools: false,
        },
        supportedPermissionModes: ['default', 'plan'],
      },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons[0]).toContain('does not support permission mode "bypassPermissions"');
  });
});
