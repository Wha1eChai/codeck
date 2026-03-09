import type { BrowserWindow } from 'electron';
import crypto from 'crypto';
import { MAIN_TO_RENDERER } from '@common/ipc-channels';
import type {
  AskUserQuestionResponse,
  ExitPlanModeRequest,
  ExitPlanModeResponse,
  Message,
  PermissionResponse,
  SessionState,
} from '@common/types';
import type { SessionMetadata } from '../sdk-adapter';
import type { SessionContext } from '../session-context';
import type { StartSessionParams } from '../claude';
import { claudeFilesService } from '../claude-files';
import { reconstructCoreMessages } from '../claude-files/transcript-to-core-messages';
import { configReader } from '../config-bridge';
import {
  assembleSystemPrompt,
  bridgeMcpTools,
  connectMcpServer,
  createDefaultToolRegistry,
  createEventToMessageMapper,
  createPermissionGate,
  createPermissionMemoryStore,
  runAgentLoop,
  startAgentLoop,
} from '@codeck/agent-core';
import type {
  McpConnection,
  PermissionCallback,
  PermissionGate,
  PermissionRequest,
} from '@codeck/agent-core';
import { createAnthropicProvider } from '@codeck/provider';
import { appPreferencesService } from '../app-preferences';

function createAutoApproveGate(): PermissionGate {
  return {
    check: async () => ({ requestId: 'auto-approved', allowed: true }),
    clearCache: () => {
      // no-op
    },
  };
}

export class KernelService {
  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    if (ctx.abortController) {
      ctx.abortController.abort();
    }
    ctx.abortController = new AbortController();

    const sessionId = params.sessionId ?? ctx.sessionId;
    const mcpConnections: McpConnection[] = [];

    const sendStatus = (status: SessionState['status'], error?: string): void => {
      if (window.isDestroyed()) return;
      const state: SessionState = { sessionId, status, error };
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_STATUS, state);
    };

    const sendMessage = (message: Message): void => {
      if (window.isDestroyed()) return;
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_MESSAGE, message);
    };

    try {
      sendStatus('streaming');

      const prefs = await appPreferencesService.get();
      const provider = createAnthropicProvider({
        ...(prefs.anthropicApiKey ? { apiKey: prefs.anthropicApiKey } : {}),
        ...(prefs.anthropicBaseUrl ? { baseURL: prefs.anthropicBaseUrl } : {}),
      });
      const modelId = params.executionOptions?.model ?? 'sonnet';
      const resolved = provider.resolveModel(modelId);

      const tools = createDefaultToolRegistry();
      const extraConnections = await this.connectMcpTools(params.cwd, tools);
      mcpConnections.push(...extraConnections);

      const permissionGate = this.createPermissionGate(window, params, ctx, sessionId, sendStatus);

      const systemPrompt = await assembleSystemPrompt({
        cwd: params.cwd,
        platform: process.platform,
        model: resolved.ref.modelId,
        date: new Date().toISOString().split('T')[0]!,
        permissionMode: params.permissionMode,
      });

      const metadata: SessionMetadata = {
        sessionId,
        model: resolved.ref.modelId,
        tools: tools.getAll().map((tool) => tool.name),
        cwd: params.cwd,
        permissionMode: params.permissionMode,
      };
      if (params.onMetadata) {
        await params.onMetadata(metadata);
      }

      const mapper = createEventToMessageMapper({
        sessionId,
        idGenerator: () => crypto.randomUUID(),
      });

      const resumeMessages = await this.loadResumeMessages(ctx.projectPath, sessionId);
      const eventStream = resumeMessages
        ? runAgentLoop(resumeMessages, {
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
          })
        : startAgentLoop(params.prompt, {
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
          });

      for await (const event of eventStream) {
        if (window.isDestroyed()) break;

        const message = mapper.map(event);
        if (!message) {
          continue;
        }

        sendMessage(message);
        if (params.onMessage) {
          try {
            await params.onMessage(message);
          } catch {
            // Ignore persistence errors.
          }
        }
      }

      sendStatus('idle');
    } catch (error) {
      if (!window.isDestroyed()) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          sessionId,
          role: 'system',
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };
        sendMessage(errorMessage);
        if (params.onMessage) {
          try {
            await params.onMessage(errorMessage);
          } catch {
            // Ignore persistence errors.
          }
        }
        sendStatus('error', error instanceof Error ? error.message : String(error));
      }
    } finally {
      await Promise.allSettled(mcpConnections.map((connection) => connection.close()));
      ctx.abortController = null;
      ctx.permissionResolver = null;
      ctx.askUserQuestionResolver = null;
      ctx.exitPlanModeResolver = null;
    }
  }

  abort(ctx: SessionContext): void {
    if (ctx.abortController) {
      ctx.abortController.abort();
      ctx.abortController = null;
    }
    if (ctx.permissionResolver) {
      ctx.permissionResolver({ requestId: '', allowed: false, reason: 'Session aborted' });
      ctx.permissionResolver = null;
    }
    if (ctx.askUserQuestionResolver) {
      ctx.askUserQuestionResolver({ requestId: '', answers: {}, cancelled: true });
      ctx.askUserQuestionResolver = null;
    }
    if (ctx.exitPlanModeResolver) {
      ctx.exitPlanModeResolver({ requestId: '', allowed: false, feedback: 'Session aborted' });
      ctx.exitPlanModeResolver = null;
    }
  }

  resolvePermission(ctx: SessionContext, response: PermissionResponse): void {
    if (ctx.permissionResolver) {
      ctx.permissionResolver(response);
      ctx.permissionResolver = null;
    }
  }

  resolveAskUserQuestion(ctx: SessionContext, response: AskUserQuestionResponse): void {
    if (ctx.askUserQuestionResolver) {
      ctx.askUserQuestionResolver(response);
      ctx.askUserQuestionResolver = null;
    }
  }

  resolveExitPlanMode(ctx: SessionContext, response: ExitPlanModeResponse): void {
    if (ctx.exitPlanModeResolver) {
      ctx.exitPlanModeResolver(response);
      ctx.exitPlanModeResolver = null;
    }
  }

  private createPermissionGate(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
    sessionId: string,
    sendStatus: (status: SessionState['status'], error?: string) => void,
  ): PermissionGate {
    const bypassPermissions =
      params.permissionMode === 'dontAsk' || params.permissionMode === 'bypassPermissions';
    const baseGate = bypassPermissions
      ? createAutoApproveGate()
      : createPermissionGate({
          store: createPermissionMemoryStore(),
          onPermissionRequest: this.createPermissionCallback(window, ctx, sessionId),
        });

    if (params.permissionMode !== 'plan') {
      return baseGate;
    }

    let planApproved = false;

    return {
      check: async (toolName, toolInput) => {
        if (!planApproved) {
          const response = await this.requestExitPlanMode(
            window,
            ctx,
            sessionId,
            toolName,
            toolInput,
            sendStatus,
          );
          if (!response.allowed) {
            return {
              requestId: response.requestId,
              allowed: false,
              reason: response.feedback ?? 'User chose to keep planning',
            };
          }
          planApproved = true;
        }

        return baseGate.check(toolName, toolInput);
      },
      clearCache: () => baseGate.clearCache(),
    };
  }

  private createPermissionCallback(
    window: BrowserWindow,
    ctx: SessionContext,
    sessionId: string,
  ): PermissionCallback {
    return (request: PermissionRequest) =>
      new Promise<PermissionResponse>((resolve) => {
        window.webContents.send(MAIN_TO_RENDERER.PERMISSION_REQUEST, {
          requestId: request.id,
          toolName: request.toolName,
          args: request.toolInput,
          riskLevel: request.risk,
          sessionId,
        });
        ctx.permissionResolver = resolve;
        const onAbort = (): void => {
          resolve({ requestId: request.id, allowed: false, reason: 'Aborted' });
        };
        ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true });
      });
  }

  private requestExitPlanMode(
    window: BrowserWindow,
    ctx: SessionContext,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    sendStatus: (status: SessionState['status'], error?: string) => void,
  ): Promise<ExitPlanModeResponse> {
    const request: ExitPlanModeRequest = {
      id: crypto.randomUUID(),
      toolUseId: `kernel-plan-${sessionId}`,
      allowedPrompts: [
        {
          tool: toolName,
          prompt: JSON.stringify(toolInput),
        },
      ],
    };

    window.webContents.send(MAIN_TO_RENDERER.EXIT_PLAN_MODE_REQUEST, request);
    sendStatus('waiting_permission');

    return new Promise<ExitPlanModeResponse>((resolve) => {
      ctx.exitPlanModeResolver = (response) => {
        sendStatus('streaming');
        resolve(response);
      };
      const onAbort = (): void => {
        sendStatus('streaming');
        resolve({ requestId: request.id, allowed: false, feedback: 'Session aborted' });
      };
      ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async loadResumeMessages(projectPath: string, sessionId: string): Promise<
    Parameters<typeof runAgentLoop>[0] | null
  > {
    const metadata = await claudeFilesService.getSessionMetadata(projectPath, sessionId).catch(() => null);
    if (!metadata || metadata.runtime !== 'kernel') {
      return null;
    }

    const transcript = await claudeFilesService.getSessionMessages(projectPath, sessionId).catch(() => []);
    if (transcript.length === 0) {
      return null;
    }

    return reconstructCoreMessages(transcript) as Parameters<typeof runAgentLoop>[0];
  }

  private async connectMcpTools(cwd: string, tools: ReturnType<typeof createDefaultToolRegistry>) {
    const entries = await configReader.getMcpServers(cwd).catch(() => []);
    const connections: McpConnection[] = [];

    for (const entry of entries) {
      if (!entry.config.command) {
        continue;
      }

      const connection = await connectMcpServer(entry.name, entry.config);
      connections.push(connection);

      const bridged = bridgeMcpTools(connection, await connection.listTools());
      for (const tool of bridged) {
        const name = tools.get(tool.name) ? `${entry.name}.${tool.name}` : tool.name;
        tools.register({
          ...tool,
          name,
          description:
            name === tool.name ? tool.description : `${tool.description} [${entry.name}]`,
        });
      }
    }

    return connections;
  }
}

export const kernelService = new KernelService();
