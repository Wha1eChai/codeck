/**
 * CLI Service — orchestrates CLI subprocess lifecycle for structured IO runtimes.
 *
 * Manages: CliProcessManager → CliMessageParser → IPC callbacks.
 * Follows the same service pattern as KernelService (thin orchestrator, no SDK dependency).
 */
import type { BrowserWindow } from 'electron'
import crypto from 'crypto'
import { MAIN_TO_RENDERER } from '@common/ipc-channels'
import type { Message, SessionState } from '@common/types'
import type { SessionContext } from '../session-context'
import type { StartSessionParams } from '../claude'
import type { SessionMetadata } from '../sdk-adapter'
import { CliProcessManager, createLineReader, type CliSpawnConfig } from './cli-process-manager'
import { parseCliMessage } from './cli-message-parser'
import { appPreferencesService } from '../app-preferences'
import { createLogger } from '../logger'

const logger = createLogger('cli-service')

export interface CliServiceConfig {
  /** CLI type identifier (e.g. 'codex', 'opencode'). */
  readonly cliType: string
  /** Build CLI spawn args from session params. */
  readonly buildArgs: (params: StartSessionParams) => readonly string[]
  /** CLI-specific output format flag (e.g. '--output-format stream-json'). Default: none. */
  readonly outputFormatArgs?: readonly string[]
}

const DEFAULT_CODEX_CONFIG: CliServiceConfig = {
  cliType: 'codex',
  buildArgs: (params) => {
    const args: string[] = ['-p', params.prompt]
    if (params.cwd) args.push('--cwd', params.cwd)
    return args
  },
}

const CLI_CONFIGS: Record<string, CliServiceConfig> = {
  codex: DEFAULT_CODEX_CONFIG,
  opencode: {
    cliType: 'opencode',
    buildArgs: (params) => {
      const args: string[] = ['-p', params.prompt]
      if (params.cwd) args.push('--cwd', params.cwd)
      return args
    },
  },
}

export class CliService {
  private readonly processManager = new CliProcessManager()
  private readonly cliType: string

  constructor(cliType: string) {
    this.cliType = cliType
  }

  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    // Abort previous session if running
    if (ctx.abortController) {
      ctx.abortController.abort()
    }
    ctx.abortController = new AbortController()

    const sessionId = params.sessionId ?? ctx.sessionId
    let managedProcessId: string | null = null

    const sendStatus = (status: SessionState['status'], error?: string): void => {
      if (window.isDestroyed()) return
      const state: SessionState = { sessionId, status, error }
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_STATUS, state)
    }

    const sendMessage = (message: Message): void => {
      if (window.isDestroyed()) return
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_MESSAGE, message)
    }

    try {
      sendStatus('streaming')

      // Resolve CLI path
      const cliPath = await this.resolveCli()
      if (!cliPath) {
        throw new Error(
          `CLI tool '${this.cliType}' not found. Install it or configure the path in Settings.`,
        )
      }

      // Build spawn config
      const config = CLI_CONFIGS[this.cliType] ?? DEFAULT_CODEX_CONFIG
      const baseArgs = config.buildArgs(params)
      const outputArgs = config.outputFormatArgs ?? []

      const spawnConfig: CliSpawnConfig = {
        cliPath,
        cwd: params.cwd,
        args: [...baseArgs, ...outputArgs],
      }

      // Spawn subprocess
      const managed = this.processManager.spawn(spawnConfig)
      managedProcessId = managed.id
      logger.info(`spawned CLI process ${managed.id} (${this.cliType})`)

      // Wire abort to kill
      const abortHandler = (): void => {
        this.processManager.kill(managed.id)
      }
      ctx.abortController.signal.addEventListener('abort', abortHandler, { once: true })

      // Emit metadata
      const metadata: SessionMetadata = {
        sessionId,
        model: `${this.cliType}-managed`,
        tools: [],
        cwd: params.cwd,
        permissionMode: params.permissionMode,
      }
      if (params.onMetadata) {
        await params.onMetadata(metadata)
      }

      // Read stdout line by line, parse, and dispatch
      if (managed.process.stdout) {
        for await (const line of createLineReader(managed.process.stdout)) {
          if (window.isDestroyed()) break
          if (ctx.abortController?.signal.aborted) break

          const result = parseCliMessage(line, sessionId)
          if (!result) continue

          // Dispatch messages
          for (const message of result.messages) {
            sendMessage(message)
            if (params.onMessage) {
              try {
                await params.onMessage(message)
              } catch {
                // Ignore persistence errors
              }
            }
          }

          // Handle metadata (e.g. session_id from CLI)
          if (result.metadata && params.onMetadata) {
            await params.onMetadata({ sessionId: result.metadata.sessionId } as SessionMetadata)
          }

          // Done signal
          if (result.isDone) break
        }
      }

      // Collect stderr for error reporting
      let stderr = ''
      if (managed.process.stderr) {
        for await (const chunk of managed.process.stderr) {
          stderr += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8')
          // Cap stderr collection
          if (stderr.length > 8000) break
        }
      }

      // Wait for process to exit
      const exitCode = await new Promise<number | null>((resolve) => {
        if (managed.process.exitCode !== null) {
          resolve(managed.process.exitCode)
          return
        }
        managed.process.on('exit', (code) => resolve(code))
        managed.process.on('error', () => resolve(null))
      })

      if (exitCode !== null && exitCode !== 0 && stderr.length > 0) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          sessionId,
          role: 'system',
          type: 'error',
          content: `CLI exited with code ${exitCode}: ${stderr.trim().slice(0, 2000)}`,
          timestamp: Date.now(),
        }
        sendMessage(errorMessage)
        if (params.onMessage) {
          try {
            await params.onMessage(errorMessage)
          } catch {
            // Ignore persistence errors
          }
        }
      }

      sendStatus('idle')
    } catch (error) {
      if (!window.isDestroyed()) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          sessionId,
          role: 'system',
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        }
        sendMessage(errorMessage)
        if (params.onMessage) {
          try {
            await params.onMessage(errorMessage)
          } catch {
            // Ignore persistence errors
          }
        }
        sendStatus('error', error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (managedProcessId) {
        this.processManager.kill(managedProcessId)
      }
      ctx.abortController = null
      ctx.permissionResolver = null
      ctx.askUserQuestionResolver = null
      ctx.exitPlanModeResolver = null
    }
  }

  abort(ctx: SessionContext): void {
    if (ctx.abortController) {
      ctx.abortController.abort()
      ctx.abortController = null
    }
  }

  private async resolveCli(): Promise<string | null> {
    // 1. User-configured path from preferences
    const prefs = await appPreferencesService.get()
    const cliPaths = prefs.cliPaths as Record<string, string> | undefined
    if (cliPaths?.[this.cliType]) {
      const configuredPath = cliPaths[this.cliType]!
      if (await this.processManager.isHealthy(configuredPath)) {
        return configuredPath
      }
      logger.warn(`configured CLI path '${configuredPath}' is not healthy, falling back to discovery`)
    }

    // 2. Auto-discovery
    return this.processManager.discoverCli(this.cliType)
  }
}
