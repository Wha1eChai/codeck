import type { BrowserWindow } from 'electron';
import type {
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RewindFilesResult,
} from '@common/types';
import type { RuntimeAdapter, RuntimeCapabilityReport } from './types';
import type { ClaudeService, StartSessionParams } from '../claude';
import type { SessionContext } from '../session-context';

const CLAUDE_CAPABILITIES: RuntimeCapabilityReport = {
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
  },
  supportedPermissionModes: [
    'default',
    'plan',
    'acceptEdits',
    'dontAsk',
    'bypassPermissions',
  ],
  notes: [
    'Uses @anthropic-ai/claude-agent-sdk query() stream',
    'Session metadata and resume rely on SDK system/init payload',
  ],
};

export class ClaudeRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'claude' as const;

  constructor(private readonly claudeService: ClaudeService) {}

  getCapabilities(): RuntimeCapabilityReport {
    return CLAUDE_CAPABILITIES;
  }

  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    return this.claudeService.startSession(window, params, ctx);
  }

  abort(ctx: SessionContext): void {
    this.claudeService.abort(ctx);
  }

  resolvePermission(ctx: SessionContext, response: PermissionResponse): void {
    this.claudeService.resolvePermission(ctx, response);
  }

  resolveAskUserQuestion(
    ctx: SessionContext,
    response: AskUserQuestionResponse,
  ): void {
    this.claudeService.resolveAskUserQuestion(ctx, response);
  }

  resolveExitPlanMode(
    ctx: SessionContext,
    response: ExitPlanModeResponse,
  ): void {
    this.claudeService.resolveExitPlanMode(ctx, response);
  }

  async rewindFiles(
    ctx: SessionContext,
    userMessageId: string,
    dryRun?: boolean,
  ): Promise<RewindFilesResult> {
    return this.claudeService.rewindFiles(ctx, userMessageId, dryRun);
  }
}
