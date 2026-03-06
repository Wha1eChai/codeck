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
    resume: false,
    permissionPrompt: true,
    streamDelta: true,
    nativeFileHistory: false,
    checkpointing: false,
    hooks: false,
    modelSelection: true,
    embeddedTerminal: false,
  },
  supportedPermissionModes: ['default', 'dontAsk', 'bypassPermissions'],
  notes: [
    'Self-hosted agent kernel using Vercel AI SDK',
    'No SDK dependency — direct API calls',
    'Resume, checkpointing, and hooks not yet supported',
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
    _ctx: SessionContext,
    _response: AskUserQuestionResponse,
  ): void {
    // Not yet supported in kernel runtime
  }

  resolveExitPlanMode(
    _ctx: SessionContext,
    _response: ExitPlanModeResponse,
  ): void {
    // Not yet supported in kernel runtime
  }

  async rewindFiles(
    _ctx: SessionContext,
    _userMessageId: string,
    _dryRun?: boolean,
  ): Promise<RewindFilesResult> {
    return { canRewind: false, error: 'Rewind not supported in kernel runtime' }
  }
}
