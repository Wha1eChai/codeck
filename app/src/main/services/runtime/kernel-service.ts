import type { BrowserWindow } from 'electron';
import crypto from 'crypto';
import { MAIN_TO_RENDERER } from '@common/ipc-channels';
import type {
  AskUserQuestionResponse,
  ExitPlanModeRequest,
  ExitPlanModeResponse,
  Message,
  PermissionMode,
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
  TeamBridge,
} from '@codeck/agent-core';
import { createAnthropicProvider } from '@codeck/provider';
import { appPreferencesService } from '../app-preferences';
import { sessionManager } from '../session';

/**
 * Abstraction to break the circular dependency between KernelService and SessionOrchestrator.
 * setup.ts injects the concrete implementation after both are constructed.
 */
export interface TeamBridgeDeps {
  sendMessage(window: BrowserWindow, input: {
    sessionId: string
    content: string
    permissionMode?: PermissionMode
    executionOptions?: StartSessionParams['executionOptions']
  }): Promise<void>
}

function createAutoApproveGate(): PermissionGate {
  return {
    check: async () => ({ requestId: 'auto-approved', allowed: true }),
    clearCache: () => {
      // no-op
    },
  };
}

export class KernelService {
  private _teamBridgeDeps: TeamBridgeDeps | null = null;

  /**
   * Inject team bridge dependencies. Called once from setup.ts after the
   * orchestrator and session manager are constructed, breaking the circular
   * import between KernelService ↔ SessionOrchestrator.
   */
  setTeamBridgeDeps(deps: TeamBridgeDeps): void {
    this._teamBridgeDeps = deps;
  }

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
        maxTokens: 30_000,
      });

      // Context optimization — derive from model capabilities + user preferences
      const enableContextOpt = prefs.enableContextOptimization !== false;
      const contextWindow = enableContextOpt ? resolved.capabilities.contextWindow : undefined;
      const maxOutputTokens = resolved.capabilities.maxOutputTokens;
      const enablePromptCaching = prefs.enablePromptCaching !== false;
      const enableTeamTools = prefs.enableAgentTeams === true && this._teamBridgeDeps !== null;

      // Team bridge — connects agent-core team tools to real session orchestrator
      const teamBridge = enableTeamTools
        ? this.createTeamBridge(window, sessionId, ctx.projectPath, params)
        : undefined;

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

      const toolContext = {
        sessionId,
        cwd: params.cwd,
        abortSignal: ctx.abortController.signal,
        ...(teamBridge ? { teamBridge } : {}),
      };

      const resumeMessages = await this.loadResumeMessages(ctx.projectPath, sessionId);
      const eventStream = resumeMessages
        ? runAgentLoop(resumeMessages, {
            model: resolved.languageModel,
            systemPrompt,
            tools,
            toolContext,
            permissionGate,
            maxSteps: params.executionOptions?.maxTurns ?? 100,
            abortSignal: ctx.abortController.signal,
            ...(contextWindow ? { contextWindow, maxOutputTokens } : {}),
            enablePromptCaching,
            enableSubAgent: true,
            enableTeamTools,
          })
        : startAgentLoop(params.prompt, {
            model: resolved.languageModel,
            systemPrompt,
            tools,
            toolContext,
            permissionGate,
            maxSteps: params.executionOptions?.maxTurns ?? 100,
            abortSignal: ctx.abortController.signal,
            images: params.images,
            ...(contextWindow ? { contextWindow, maxOutputTokens } : {}),
            enablePromptCaching,
            enableSubAgent: true,
            enableTeamTools,
          });

      for await (const event of eventStream) {
        if (window.isDestroyed()) break;

        // Handle sub-agent child events batch
        if (event.type === 'child_events') {
          const childMapper = createEventToMessageMapper({
            sessionId,
            idGenerator: () => crypto.randomUUID(),
          });
          // P2-fix: Aggregate child usage from step_end events
          const childUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
          for (const childEvent of event.events) {
            if (childEvent.type === 'step_end') {
              childUsage.inputTokens += childEvent.usage.inputTokens;
              childUsage.outputTokens += childEvent.usage.outputTokens;
              childUsage.cacheReadTokens += childEvent.usage.cacheReadTokens ?? 0;
              childUsage.cacheWriteTokens += childEvent.usage.cacheWriteTokens ?? 0;
              continue;
            }
            if (childEvent.type === 'done') continue;
            const childMsg = childMapper.map(childEvent);
            if (!childMsg) continue;
            const tagged: Message = { ...childMsg, parentToolUseId: event.toolCallId } as Message;
            sendMessage(tagged);
            if (params.onMessage) {
              try {
                await params.onMessage(tagged);
              } catch {
                // Ignore persistence errors.
              }
            }
          }
          // Emit aggregated child usage as a synthetic usage message
          if (childUsage.inputTokens > 0 || childUsage.outputTokens > 0) {
            const usageMsg: Message = {
              id: crypto.randomUUID(),
              sessionId,
              role: 'system',
              type: 'usage',
              content: '',
              timestamp: Date.now(),
              parentToolUseId: event.toolCallId,
              usage: {
                inputTokens: childUsage.inputTokens,
                outputTokens: childUsage.outputTokens,
                ...(childUsage.cacheReadTokens > 0 ? { cacheReadTokens: childUsage.cacheReadTokens } : {}),
                ...(childUsage.cacheWriteTokens > 0 ? { cacheWriteTokens: childUsage.cacheWriteTokens } : {}),
              },
            } as Message;
            sendMessage(usageMsg);
            if (params.onMessage) {
              try {
                await params.onMessage(usageMsg);
              } catch {
                // Ignore persistence errors.
              }
            }
          }
          continue;
        }

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

  private createTeamBridge(
    window: BrowserWindow,
    parentSessionId: string,
    projectPath: string,
    params: StartSessionParams,
  ): TeamBridge {
    const deps = this._teamBridgeDeps!;

    return {
      spawnChild: async ({ role, prompt, useWorktree, model }) => {
        const childSession = await sessionManager.createSession({
          name: `[${role}] ${prompt.slice(0, 40)}`,
          projectPath,
          runtime: 'kernel',
          permissionMode: params.permissionMode,
          useWorktree,
          parentSessionId,
          role,
          isTeamSession: true,
        });

        // Fire-and-forget: start the child session asynchronously
        deps.sendMessage(window, {
          sessionId: childSession.id,
          content: prompt,
          permissionMode: params.permissionMode,
          executionOptions: model ? { ...params.executionOptions, model } : params.executionOptions,
        }).catch(() => {
          // Child session errors are surfaced via getChildStatus, not here
        });

        return { sessionId: childSession.id };
      },

      sendToChild: async (childSessionId, message) => {
        // Validate parent-child relationship
        const childIds = sessionManager.getChildSessionIds(parentSessionId);
        if (!childIds.includes(childSessionId)) {
          throw new Error(
            `Session "${childSessionId}" is not a child of "${parentSessionId}"`,
          );
        }

        await deps.sendMessage(window, {
          sessionId: childSessionId,
          content: message,
          permissionMode: params.permissionMode,
          executionOptions: params.executionOptions,
        });
      },

      getChildStatus: async (childSessionId) => {
        // Validate parent-child relationship
        const childIds = sessionManager.getChildSessionIds(parentSessionId);
        if (!childIds.includes(childSessionId)) {
          return { status: 'not_found' as const };
        }

        const activeState = sessionManager.getActiveSession(childSessionId);
        if (!activeState) {
          return { status: 'not_found' as const };
        }

        // Map SessionManager status to TeamBridge status
        const statusMap: Record<string, 'idle' | 'streaming' | 'error'> = {
          idle: 'idle',
          streaming: 'streaming',
          waiting_permission: 'streaming',
          error: 'error',
        };
        const status = statusMap[activeState.status] ?? 'idle';

        // Read the last assistant message from the child session
        let lastMessage: string | undefined;
        try {
          const messages = await sessionManager.getSessionMessages(
            projectPath,
            childSessionId,
          );
          const lastAssistant = messages
            .filter((m) => m.role === 'assistant' && m.type === 'text' && m.content)
            .at(-1);
          if (lastAssistant) {
            lastMessage = lastAssistant.content;
          }
        } catch {
          // Ignore read errors — status is still valid
        }

        return {
          status,
          ...(lastMessage ? { lastMessage } : {}),
          ...(activeState.error ? { error: activeState.error } : {}),
        };
      },
    };
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

  private async connectMcpTools(cwd: string, tools: ReturnType<typeof createDefaultToolRegistry>): Promise<McpConnection[]> {
    const entries = await configReader.getMcpServers(cwd).catch(() => []);
    const connections: McpConnection[] = [];

    for (const entry of entries) {
      if (!entry.config.command) {
        continue;
      }

      try {
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
      } catch {
        // One misconfigured MCP server should not block the entire session
      }
    }

    return connections;
  }
}
