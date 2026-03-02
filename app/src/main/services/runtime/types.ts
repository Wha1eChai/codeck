import type { PermissionMode } from '@common/types';

export type RuntimeId = 'claude' | 'codex' | 'opencode';

export interface RuntimeCapabilityReport {
  runtime: RuntimeId;
  supports: {
    resume: boolean;
    permissionPrompt: boolean;
    streamDelta: boolean;
    nativeFileHistory: boolean;
    // Phase 2 capabilities
    checkpointing: boolean;
    hooks: boolean;
    modelSelection: boolean;
    embeddedTerminal: boolean;
  };
  supportedPermissionModes: PermissionMode[];
  notes?: string[];
}

export interface RuntimeAdapter {
  readonly id: RuntimeId;
  getCapabilities(): RuntimeCapabilityReport;
}
