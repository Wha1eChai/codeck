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
import type { CliService } from './cli-service'

/**
 * Thin RuntimeAdapter for CLI-based runtimes.
 * Delegates all execution to CliService, parameterized by cliType.
 */
export class CliRuntimeAdapter implements RuntimeAdapter {
  readonly id: RuntimeId

  constructor(
    private readonly cliService: CliService,
    cliType: RuntimeId,
  ) {
    this.id = cliType
  }

  getCapabilities(): RuntimeCapabilityReport {
    return {
      runtime: this.id,
      supports: {
        resume: false,
        permissionPrompt: false,
        streamDelta: true,
        nativeFileHistory: false,
        checkpointing: false,
        hooks: false,
        modelSelection: false,
        embeddedTerminal: false,
        teamTools: false,
      },
      supportedPermissionModes: ['bypassPermissions'],
      notes: [`CLI runtime via ${this.id} subprocess`],
    }
  }

  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    return this.cliService.startSession(window, params, ctx)
  }

  abort(ctx: SessionContext): void {
    this.cliService.abort(ctx)
  }

  resolvePermission(_ctx: SessionContext, _response: PermissionResponse): void {
    // CLI runtimes don't support interactive permission requests yet
  }

  resolveAskUserQuestion(_ctx: SessionContext, _response: AskUserQuestionResponse): void {
    // CLI runtimes don't support interactive questions yet
  }

  resolveExitPlanMode(_ctx: SessionContext, _response: ExitPlanModeResponse): void {
    // CLI runtimes don't support plan mode yet
  }

  async rewindFiles(
    _ctx: SessionContext,
    _userMessageId: string,
    _dryRun?: boolean,
  ): Promise<RewindFilesResult> {
    return { canRewind: false, error: `Rewind not supported in ${this.id} runtime` }
  }
}
