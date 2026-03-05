import type { BrowserWindow } from 'electron';
import type {
  PermissionMode,
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RewindFilesResult,
} from '@common/types';
import type { SessionContext } from '../session-context';
import type { StartSessionParams } from '../claude';

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

  // Execution methods
  startSession(window: BrowserWindow, params: StartSessionParams, ctx: SessionContext): Promise<void>;
  abort(ctx: SessionContext): void;
  resolvePermission(ctx: SessionContext, response: PermissionResponse): void;
  resolveAskUserQuestion(ctx: SessionContext, response: AskUserQuestionResponse): void;
  resolveExitPlanMode(ctx: SessionContext, response: ExitPlanModeResponse): void;
  rewindFiles(ctx: SessionContext, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult>;
}
