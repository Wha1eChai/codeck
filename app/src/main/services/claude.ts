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
} from '@common/types';
import crypto from 'crypto';
import {
  createSDKMessageParser,
  createPermissionHandler,
  buildQueryArgs,
  getSDKEnv,
  mapMcpServersToSDKConfig,
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

export class ClaudeService {
  // ── Shared (non-per-session) state ──
  private cachedEnv: Record<string, string> | null = null;

  // ── Legacy single-session state (backward compat — used until all callers migrate to ctx) ──
  private abortController: AbortController | null = null;
  private permissionResolver: ((response: PermissionResponse) => void) | null = null;
  private askUserQuestionResolver: ((response: AskUserQuestionResponse) => void) | null = null;
  private exitPlanModeResolver: ((response: ExitPlanModeResponse) => void) | null = null;
  private sessionMetadata: SessionMetadata | null = null;
  private sdkSessionId: string | null = null;
  private permissionStore: PersistentPermissionStore | null = null;
  private lastProjectPath: string | null = null;
  private queryRef: SDKQuery | null = null;

  // ── Context-aware resolve methods ──

  resolvePermission(response: PermissionResponse): void {
    if (this.permissionResolver) {
      this.permissionResolver(response);
      this.permissionResolver = null;
    }
  }

  resolvePermissionForContext(ctx: SessionContext, response: PermissionResponse): void {
    if (ctx.permissionResolver) {
      ctx.permissionResolver(response);
      ctx.permissionResolver = null;
    }
  }

  resolveAskUserQuestion(response: AskUserQuestionResponse): void {
    if (this.askUserQuestionResolver) {
      this.askUserQuestionResolver(response);
      this.askUserQuestionResolver = null;
    }
  }

  resolveAskUserQuestionForContext(ctx: SessionContext, response: AskUserQuestionResponse): void {
    if (ctx.askUserQuestionResolver) {
      ctx.askUserQuestionResolver(response);
      ctx.askUserQuestionResolver = null;
    }
  }

  resolveExitPlanMode(response: ExitPlanModeResponse): void {
    if (this.exitPlanModeResolver) {
      this.exitPlanModeResolver(response);
      this.exitPlanModeResolver = null;
    }
  }

  resolveExitPlanModeForContext(ctx: SessionContext, response: ExitPlanModeResponse): void {
    if (ctx.exitPlanModeResolver) {
      ctx.exitPlanModeResolver(response);
      ctx.exitPlanModeResolver = null;
    }
  }

  getSessionMetadata(): SessionMetadata | null {
    return this.sessionMetadata;
  }

  getSDKSessionId(): string | null {
    return this.sdkSessionId;
  }

  setSDKSessionId(sessionId: string | null): void {
    this.sdkSessionId = sessionId;
  }

  private async getEnv(): Promise<Record<string, string>> {
    if (!this.cachedEnv) {
      this.cachedEnv = await getSDKEnv();
    }
    return this.cachedEnv;
  }

  /**
   * Start a session using a SessionContext (multi-session mode).
   * All mutable state (abort, resolvers, queryRef) lives in the context.
   */
  async startSessionWithContext(
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

      const [prefs, mcpEntries] = await Promise.all([
        appPreferencesService.get(),
        configReader.getMcpServers(params.cwd).catch(() => []),
      ]);
      const mcpServers = mapMcpServersToSDKConfig(mcpEntries);

      const queryArgs = buildQueryArgs(
        {
          ...params,
          env: await this.getEnv(),
          resume: ctx.sdkSessionId ?? undefined,
          executionOptions: params.executionOptions,
          hookSettings: params.hookSettings,
          checkpointEnabled: prefs.checkpointEnabled,
          mcpServers,
          modelAliases: prefs.modelAliases,
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

  /**
   * Legacy single-session startSession (delegates to context-based version).
   */
  async startSession(window: BrowserWindow, params: StartSessionParams): Promise<void> {
    this.abort();
    this.abortController = new AbortController();
    const sessionId = params.sessionId ?? 'unknown';
    let parser: SDKMessageParser | null = null;

    const sendStatus = (status: SessionState['status'], error?: string): void => {
      if (window.isDestroyed()) return;
      const state: SessionState = { sessionId, status, error };
      window.webContents.send(MAIN_TO_RENDERER.CLAUDE_STATUS, state);
      if (params.onStatus) {
        Promise.resolve(params.onStatus(state)).catch((persistError) => {
          if (process.env.NODE_ENV === 'development') {
            process.stderr.write(`Failed to persist status: ${persistError}\n`);
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

      if (!this.permissionStore || this.lastProjectPath !== params.cwd) {
        this.permissionStore = new PersistentPermissionStore(params.cwd);
        await this.permissionStore.load();
        this.lastProjectPath = params.cwd;
      }

      const permissionStore = this.permissionStore;
      const canUseTool = createPermissionHandler({
        sendToRenderer: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.PERMISSION_REQUEST, request);
        },
        waitForResponse: () => {
          return new Promise<PermissionResponse>((resolve) => {
            this.permissionResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', allowed: false, reason: 'Aborted' });
            };
            this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        sendAskUserQuestion: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.ASK_USER_QUESTION, request);
        },
        waitForAskUserQuestion: () => {
          return new Promise<AskUserQuestionResponse>((resolve) => {
            this.askUserQuestionResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', answers: {}, cancelled: true });
            };
            this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        sendExitPlanMode: (request) => {
          window.webContents.send(MAIN_TO_RENDERER.EXIT_PLAN_MODE_REQUEST, request);
        },
        waitForExitPlanMode: () => {
          return new Promise<ExitPlanModeResponse>((resolve) => {
            this.exitPlanModeResolver = resolve;
            const onAbort = () => {
              resolve({ requestId: '', allowed: false, feedback: 'Session aborted' });
            };
            this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
          });
        },
        onStatusChange: sendStatus,
        isWindowDestroyed: () => window.isDestroyed(),
        decisionStore: permissionStore,
      });

      const [prefs, mcpEntries] = await Promise.all([
        appPreferencesService.get(),
        configReader.getMcpServers(params.cwd).catch(() => []),
      ]);
      const mcpServers = mapMcpServersToSDKConfig(mcpEntries);

      const queryArgs = buildQueryArgs(
        {
          ...params,
          env: await this.getEnv(),
          resume: this.sdkSessionId ?? undefined,
          executionOptions: params.executionOptions,
          hookSettings: params.hookSettings,
          checkpointEnabled: prefs.checkpointEnabled,
          mcpServers,
          modelAliases: prefs.modelAliases,
        },
        canUseTool,
        this.abortController,
      );

      if (process.env.NODE_ENV === 'development') {
        const { canUseTool: _c, abortController: _a, hooks: _h, env: _e, ...loggable } = queryArgs.options;
        process.stdout.write(
          `\n\x1b[36m[SDK:${sessionId}] ── Request ──\x1b[0m\n${JSON.stringify({ prompt: queryArgs.prompt, options: loggable }, null, 2)}\n`,
        );
      }

      const stream = query(queryArgs) as unknown as SDKQuery;
      this.queryRef = stream;
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
          this.sessionMetadata = result.metadata;
          if (result.metadata.sessionId) {
            this.sdkSessionId = result.metadata.sessionId;
          }
          if (params.onMetadata) {
            try {
              await params.onMetadata(result.metadata);
            } catch (persistError) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist metadata: ${persistError}\n`);
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
            } catch (persistError) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist message: ${persistError}\n`);
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
            } catch (persistError) {
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(`Failed to persist error message: ${persistError}\n`);
              }
            }
          }
        }
        sendStatus('error', error instanceof Error ? error.message : String(error));
      }
    } finally {
      parser?.reset();
      this.abortController = null;
      this.permissionResolver = null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.permissionResolver) {
      this.permissionResolver({
        requestId: '',
        allowed: false,
        reason: 'Session aborted',
      });
      this.permissionResolver = null;
    }
    if (this.askUserQuestionResolver) {
      this.askUserQuestionResolver({ requestId: '', answers: {}, cancelled: true });
      this.askUserQuestionResolver = null;
    }
    if (this.exitPlanModeResolver) {
      this.exitPlanModeResolver({ requestId: '', allowed: false, feedback: 'Session aborted' });
      this.exitPlanModeResolver = null;
    }
  }

  /** Abort a specific session context. */
  abortContext(ctx: SessionContext): void {
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

  resetSession(): void {
    this.abort();
    this.sessionMetadata = null;
    this.sdkSessionId = null;
    this.queryRef = null;
  }

  async rewindFiles(userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult> {
    if (!this.queryRef) {
      return { canRewind: false, error: 'No active query — cannot rewind files.' };
    }
    try {
      const result = await this.queryRef.rewindFiles(userMessageId, dryRun ? { dryRun } : undefined);
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

  /** Rewind files using a specific session context's query ref. */
  async rewindFilesForContext(ctx: SessionContext, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult> {
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
