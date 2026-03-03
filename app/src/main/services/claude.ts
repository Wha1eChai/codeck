import { query } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';
import { MAIN_TO_RENDERER } from '@common/ipc-channels';
import type {
  ExecutionOptions,
  HookSettings,
  Message,
  PermissionMode,
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RewindFilesResult,
  SessionState,
  StructuredOutputConfig,
} from '@common/types';
import type { SDKOutputFormat } from './sdk-adapter/sdk-types';
import crypto from 'crypto';
import {
  createSDKMessageParser,
  createPermissionHandler,
  buildQueryArgs,
  getSDKEnv,
  mapMcpServersToSDKConfig,
  mapAgentsToSDKDefinitions,
} from './sdk-adapter';
import type {
  SessionMetadata,
  SDKMessageParser,
  SDKQuery,
} from './sdk-adapter';
import { appPreferencesService } from './app-preferences';
import { configReader } from './config-bridge';
import { PersistentPermissionStore } from './permission-store';
import type { SessionContext } from './session-context';

export interface StartSessionParams {
  prompt: string;
  cwd: string;
  sessionId?: string;
  permissionMode: PermissionMode;
  /** Phase 2: SDK execution parameters (model, maxTurns, budget, etc.) */
  executionOptions?: ExecutionOptions;
  /** Phase 2: SDK hooks settings (auto-allow, blocked commands) */
  hookSettings?: HookSettings;
  onMessage?: (message: Message) => Promise<void> | void;
  onMetadata?: (metadata: SessionMetadata) => Promise<void> | void;
  onStatus?: (state: SessionState) => Promise<void> | void;
}

function buildOutputFormat(config: StructuredOutputConfig): SDKOutputFormat | undefined {
  try {
    const schema = JSON.parse(config.schema) as Record<string, unknown>
    return {
      type: 'json_schema',
      schema: {
        name: config.name,
        ...(config.description ? { description: config.description } : {}),
        schema,
      },
    }
  } catch {
    return undefined
  }
}

export class ClaudeService {
  // ── Shared (non-per-session) state ──
  private cachedEnv: Record<string, string> | null = null;

  // ── Resolve methods (all context-based) ──

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

  private async getEnv(): Promise<Record<string, string>> {
    if (!this.cachedEnv) {
      this.cachedEnv = await getSDKEnv();
    }
    return this.cachedEnv;
  }

  /**
   * Start a session using a SessionContext.
   * All mutable state (abort, resolvers, queryRef) lives in the context.
   */
  async startSession(
    window: BrowserWindow,
    params: StartSessionParams,
    ctx: SessionContext,
  ): Promise<void> {
    // Abort previous run for this context if any
    if (ctx.abortController) {
      ctx.abortController.abort();
    }
    ctx.abortController = new AbortController();
    const sessionId = params.sessionId ?? ctx.sessionId;
    let parser: SDKMessageParser | null = null;

    const sendStatus = (status: SessionState['status'], error?: string): void => {
      if (window.isDestroyed()) return;
      const state: SessionState = { sessionId, status, error };
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_STATUS, state);
      if (params.onStatus) {
        Promise.resolve(params.onStatus(state)).catch((e) => {
          if (process.env.NODE_ENV === 'development') {
            process.stderr.write(`Failed to persist status: ${e}\n`);
          }
        });
      }
    };

    const sendMessage = (message: Message): void => {
      if (window.isDestroyed()) return;
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_MESSAGE, message);
    };

    let errorAlreadySent = false;
    try {
      sendStatus('streaming');

      // Initialize or reuse persistent permission store per project
      if (!ctx.permissionStore || ctx.projectPath !== params.cwd) {
        ctx.permissionStore = new PersistentPermissionStore(params.cwd);
        await ctx.permissionStore.load();
      }

      const permissionStore = ctx.permissionStore;
      const canUseTool = createPermissionHandler({
        sendToRenderer: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.PERMISSION_REQUEST, request);
        },
        waitForResponse: () => {
          return new Promise<PermissionResponse>((resolve) => {
            ctx.permissionResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', allowed: false, reason: 'Aborted' });
            };
            ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        sendAskUserQuestion: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.ASK_USER_QUESTION, request);
        },
        waitForAskUserQuestion: () => {
          return new Promise<AskUserQuestionResponse>((resolve) => {
            ctx.askUserQuestionResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', answers: {}, cancelled: true });
            };
            ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        sendExitPlanMode: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.EXIT_PLAN_MODE_REQUEST, request);
        },
        waitForExitPlanMode: () => {
          return new Promise<ExitPlanModeResponse>((resolve) => {
            ctx.exitPlanModeResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', allowed: false, feedback: 'Session aborted' });
            };
            ctx.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        onStatusChange: sendStatus,
        isWindowDestroyed: () => window.isDestroyed(),
        decisionStore: permissionStore,
      });

      const [prefs, mcpEntries, agentEntries] = await Promise.all([
        appPreferencesService.get(),
        configReader.getMcpServers(params.cwd).catch(() => []),
        configReader.getAllAgents(params.cwd).catch(() => []),
      ]);
      const mcpServers = mapMcpServersToSDKConfig(mcpEntries);
      const agents = mapAgentsToSDKDefinitions(agentEntries);

      const outputFormat = prefs.structuredOutput?.enabled && prefs.structuredOutput?.schema
        ? buildOutputFormat(prefs.structuredOutput)
        : undefined;

      const queryArgs = buildQueryArgs(
        {
          ...params,
          env: await this.getEnv(),
          resume: ctx.sdkSessionId ?? undefined,
          executionOptions: params.executionOptions,
          hookSettings: params.hookSettings,
          checkpointEnabled: prefs.checkpointEnabled,
          mcpServers,
          agents,
          modelAliases: prefs.modelAliases,
          outputFormat,
        },
        canUseTool,
        ctx.abortController,
      );

      if (process.env.NODE_ENV === 'development') {
        const { canUseTool: _c, abortController: _a, hooks: _h, env: _e, ...loggable } = queryArgs.options;
        process.stdout.write(
          `\n\x1b[36m[SDK:${sessionId}] ── Request ──\x1b[0m\n${JSON.stringify({ prompt: queryArgs.prompt, options: loggable }, null, 2)}\n`,
        );
      }

      const stream = query(queryArgs) as unknown as SDKQuery;
      ctx.queryRef = stream;
      parser = createSDKMessageParser();

      for await (const sdkMsg of stream) {
        if (window.isDestroyed()) break;

        if (process.env.NODE_ENV === 'development') {
          try {
            const brief = sdkMsgBrief(sdkMsg as unknown as Record<string, unknown>);
            if (brief) process.stdout.write(`\x1b[33m[SDK:${sessionId}]\x1b[0m ${brief}\n`);
          } catch { /* skip */ }
        }

        const result = parser.parse(sdkMsg, sessionId);

        if (result.metadata) {
          ctx.sessionMetadata = result.metadata;
          if (result.metadata.sessionId) {
            ctx.sdkSessionId = result.metadata.sessionId;
          }
          // Push metadata to renderer for UI consumption
          if (!window.isDestroyed()) {
            window.webContents.send(MAIN_TO_RENDERER.SESSION_METADATA, result.metadata);
          }
          if (params.onMetadata) {
            try {
              await params.onMetadata(result.metadata);
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist metadata: ${e}\n`);
              }
            }
          }
        }

        for (const message of result.messages) {
          if (message.type === 'error') errorAlreadySent = true;
          sendMessage(message);
          if (params.onMessage) {
            try {
              await params.onMessage(message);
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist message: ${e}\n`);
              }
            }
          }
        }
      }

      sendStatus('idle');
    } catch (error) {
      if (!window.isDestroyed()) {
        if (!errorAlreadySent) {
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
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist error message: ${e}\n`);
              }
            }
          }
        }
        sendStatus('error', error instanceof Error ? error.message : String(error));
      }
    } finally {
      parser?.reset();
      ctx.abortController = null;
      ctx.permissionResolver = null;
    }
  }

  /** Abort a specific session context. */
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

  /** Rewind files using a specific session context's query ref. */
  async rewindFiles(ctx: SessionContext, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult> {
    if (!ctx.queryRef) {
      return { canRewind: false, error: 'No active query — cannot rewind files.' };
    }
    try {
      const result = await ctx.queryRef.rewindFiles(userMessageId, dryRun ? { dryRun } : undefined);
      return {
        canRewind: result.canRewind,
        error: result.error,
        filesChanged: result.filesChanged,
        insertions: result.insertions,
        deletions: result.deletions,
      };
    } catch (error) {
      return {
        canRewind: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  reloadEnv(): void {
    this.cachedEnv = null;
  }
}

export const claudeService = new ClaudeService();

// ── Debug helpers (development only) ──

function sdkMsgBrief(msg: Record<string, unknown>): string | null {
  const type = msg.type as string | undefined;
  if (type === 'stream_event') return null;

  if (type === 'assistant') {
    const nested = msg.message as Record<string, unknown> | undefined;
    const blocks = nested?.content as readonly Record<string, unknown>[] | undefined;
    if (blocks) {
      const summary = blocks.map((b) => {
        if (b.type === 'text') return `text(${truncate(b.text as string, 80)})`;
        if (b.type === 'tool_use') return `tool(${b.name})`;
        if (b.type === 'thinking') return `thinking(${truncate(b.thinking as string, 60)})`;
        return String(b.type);
      });
      return `assistant: [${summary.join(', ')}]`;
    }
  }

  if (type === 'result') {
    const sub = msg.subtype as string | undefined;
    const dur = msg.duration_ms as number | undefined;
    return `result/${sub ?? '?'}${dur ? ` (${dur}ms)` : ''} ${truncate(JSON.stringify(msg.result ?? msg), 160)}`;
  }

  const sub = msg.subtype as string | undefined;
  const tag = sub ? `${type}/${sub}` : type;
  return `${tag} ${truncate(JSON.stringify(msg), 200)}`;
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}
