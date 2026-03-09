import type { BrowserWindow } from 'electron'
import type {
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RewindFilesResult,
} from '@common/types'
import type { RuntimeAdapter, RuntimeCapabilityReport, RuntimeId } from './types'
import type { StartSessionParams } from '../claude'
import type { SessionContext } from '../session-context'
import { KernelService } from './kernel-service'

const KERNEL_CAPABILITIES: RuntimeCapabilityReport = {
  runtime: 'kernel' as RuntimeId,
  supports: {
    resume: true,
    permissionPrompt: true,
    streamDelta: true,
    nativeFileHistory: false,
    checkpointing: false,
    hooks: false,
    modelSelection: true,
    embeddedTerminal: false,
  },
  supportedPermissionModes: ['default', 'plan', 'dontAsk', 'bypassPermissions'],
  notes: [
    'Self-hosted agent kernel using Vercel AI SDK',
    'No SDK dependency — direct API calls',
    'Resume supported via local transcript reconstruction',
    'Checkpointing and hooks are still not supported',
  ],
}

export class KernelRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'kernel' as RuntimeId

  constructor(private readonly kernelService: KernelService) {}

  getCapabilities(): RuntimeCapabilityReport {
    return KERNEL_CAPABILITIES
  }

  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    return this.kernelService.startSession(window, params, ctx)
  }

  abort(ctx: SessionContext): void {
    this.kernelService.abort(ctx)
  }

  resolvePermission(ctx: SessionContext, response: PermissionResponse): void {
    this.kernelService.resolvePermission(ctx, response)
  }

  resolveAskUserQuestion(
    ctx: SessionContext,
    response: AskUserQuestionResponse,
  ): void {
    this.kernelService.resolveAskUserQuestion(ctx, response)
  }

  resolveExitPlanMode(
    ctx: SessionContext,
    response: ExitPlanModeResponse,
  ): void {
    this.kernelService.resolveExitPlanMode(ctx, response)
  }

  async rewindFiles(
    _ctx: SessionContext,
    _userMessageId: string,
    _dryRun?: boolean,
  ): Promise<RewindFilesResult> {
    return { canRewind: false, error: 'Rewind not supported in kernel runtime' }
  }
}
