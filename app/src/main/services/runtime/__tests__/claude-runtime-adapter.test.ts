import { describe, it, expect } from 'vitest';
import { ClaudeRuntimeAdapter } from '../claude-runtime-adapter';

describe('ClaudeRuntimeAdapter', () => {
  it('should report expected capabilities', () => {
    const adapter = new ClaudeRuntimeAdapter();
    const capabilities = adapter.getCapabilities();

    expect(capabilities.runtime).toBe('claude');
    expect(capabilities.supports.resume).toBe(true);
    expect(capabilities.supports.permissionPrompt).toBe(true);
    expect(capabilities.supportedPermissionModes).toContain('default');
    expect(capabilities.supportedPermissionModes).toContain('bypassPermissions');
  });

  it('should have id "claude"', () => {
    const adapter = new ClaudeRuntimeAdapter();
    expect(adapter.id).toBe('claude');
  });
});
