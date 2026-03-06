// ============================================================
// KernelService — orchestrates the self-hosted agent kernel
//
// Assembles: Provider → Model → Agent Loop → Event Mapper → IPC
// No SDK dependency — uses @codeck/provider + @codeck/agent-core
// ============================================================

import type { BrowserWindow } from 'electron'
import crypto from 'crypto'
import { MAIN_TO_RENDERER } from '@common/ipc-channels'
import type {
  Message,
  PermissionResponse,
  SessionState,
} from '@common/types'
import type { SessionContext } from '../session-context'
import type { StartSessionParams } from '../claude'
import {
  startAgentLoop,
  createDefaultToolRegistry,
  createPermissionGate,
  createPermissionMemoryStore,
  assembleSystemPrompt,
  createEventToMessageMapper,
} from '@codeck/agent-core'
import type { PermissionCallback, PermissionGate, PermissionRequest } from '@codeck/agent-core'
import { createAnthropicProvider } from '@codeck/provider'

export class KernelService {
  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    // Abort previous run if any
    if (ctx.abortController) {
      ctx.abortController.abort()
    }
    ctx.abortController = new AbortController()

    const sessionId = params.sessionId ?? ctx.sessionId

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

      // 1. Resolve model
      const provider = createAnthropicProvider()
      const modelId = params.executionOptions?.model ?? 'sonnet'
      const resolved = provider.resolveModel(modelId)

      // 2. Build tools
      const tools = createDefaultToolRegistry()

      // 3. Build permission gate
      const bypassPermissions = params.permissionMode === 'dontAsk' || params.permissionMode === 'bypassPermissions'

      let permissionGate: PermissionGate

      if (bypassPermissions) {
        // Auto-allow all tool calls without prompting the user
        permissionGate = {
          check: async (_toolName: string, _toolInput: Record<string, unknown>) => ({
            requestId: 'auto-approved',
            allowed: true,
          }),
          clearCache: () => { /* no-op */ },
        }
      } else {
        // Bridge to frontend IPC for interactive permission approval
        const permissionCallback: PermissionCallback = (request: PermissionRequest) => {
          return new Promise<PermissionResponse>((resolve) => {
            window.webContents.send(MAIN_TO_RENDERER.PERMISSION_REQUEST, {
              requestId: request.id,
              toolName: request.toolName,
              args: request.toolInput,
              riskLevel: request.risk,
              sessionId,
            })
            ctx.permissionResolver = resolve
            const onAbort = (): void => {
              resolve({ requestId: request.id, allowed: false, reason: 'Aborted' })
            }
            ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true })
          })
        }

        permissionGate = createPermissionGate({
          store: createPermissionMemoryStore(),
          onPermissionRequest: permissionCallback,
        })
      }

      // 4. Build system prompt
      const systemPrompt = await assembleSystemPrompt({
        cwd: params.cwd,
        platform: process.platform,
        model: resolved.ref.modelId,
        date: new Date().toISOString().split('T')[0]!,
      })

      // 5. Create event mapper
      const mapper = createEventToMessageMapper({
        sessionId,
        idGenerator: () => crypto.randomUUID(),
      })

      // 6. Run agent loop
      const eventStream = startAgentLoop(params.prompt, {
        model: resolved.languageModel,
        systemPrompt,
        tools,
        toolContext: {
          sessionId,
          cwd: params.cwd,
          abortSignal: ctx.abortController.signal,
        },
        permissionGate,
        maxSteps: params.executionOptions?.maxTurns ?? 100,
        abortSignal: ctx.abortController.signal,
        images: params.images,
      })

      for await (const event of eventStream) {
        if (window.isDestroyed()) break

        const message = mapper.map(event)
        if (message) {
          sendMessage(message)
          if (params.onMessage) {
            try {
              await params.onMessage(message)
            } catch {
              // Ignore persistence errors
            }
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
      ctx.abortController = null
      ctx.permissionResolver = null
    }
  }

  abort(ctx: SessionContext): void {
    if (ctx.abortController) {
      ctx.abortController.abort()
      ctx.abortController = null
    }
    if (ctx.permissionResolver) {
      ctx.permissionResolver({ requestId: '', allowed: false, reason: 'Session aborted' })
      ctx.permissionResolver = null
    }
    if (ctx.askUserQuestionResolver) {
      ctx.askUserQuestionResolver({ requestId: '', answers: {}, cancelled: true })
      ctx.askUserQuestionResolver = null
    }
    if (ctx.exitPlanModeResolver) {
      ctx.exitPlanModeResolver({ requestId: '', allowed: false, feedback: 'Session aborted' })
      ctx.exitPlanModeResolver = null
    }
  }

  resolvePermission(ctx: SessionContext, response: PermissionResponse): void {
    if (ctx.permissionResolver) {
      ctx.permissionResolver(response)
      ctx.permissionResolver = null
    }
  }
}
