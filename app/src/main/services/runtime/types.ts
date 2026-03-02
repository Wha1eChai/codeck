import type { BrowserWindow } from 'electron';
import type { ExecutionOptions, HookSettings, Message, PermissionMode, PermissionResponse, SessionState } from '@common/types';

export type RuntimeId = 'claude' | 'codex' | 'opencode';

export interface RuntimeSessionParams {
  prompt: string;
  cwd: string;
  sessionId?: string;
  permissionMode: PermissionMode;
  /** Phase 2: SDK execution parameters (model, maxTurns, budget, etc.) */
  executionOptions?: ExecutionOptions;
  /** Phase 2: SDK hooks settings (auto-allow, blocked commands) */
  hookSettings?: HookSettings;
  onMetadata?: (metadata: unknown) => Promise<void> | void;
  onMessage?: (message: Message) => Promise<void> | void;
  onStatus?: (state: SessionState) => Promise<void> | void;
}

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
  startSession(window: BrowserWindow, params: RuntimeSessionParams): Promise<void>;
  abort(): void;
  resetSession(): void;
  setResumeSessionId?(sessionId: string | null): void;
  resolvePermission(response: PermissionResponse): void;
}
