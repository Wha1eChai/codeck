import type { BrowserWindow } from 'electron';
import type {
  CreateSessionInput,
  ExecutionOptions,
  HookSettings,
  Message,
  PermissionMode,
  PermissionResponse,
  AskUserQuestionResponse,
  ExitPlanModeResponse,
  RewindFilesResult,
  Session,
} from '@common/types';
import { claudeFilesService } from './claude-files';
import { sessionManager } from './session';
import { runtimeRegistry } from './runtime';
import { runtimeContextService } from './runtime-context';
import { capabilityGate } from './capability-gate';
import { appPreferencesService } from './app-preferences';
import { sessionContextStore } from './session-context';
import { worktreeService } from './worktree-service';
import { debouncedSync } from './sessions-server';

export interface SendMessageInput {
  sessionId: string;
  content: string;
  permissionMode?: PermissionMode;
  executionOptions?: ExecutionOptions;
  hookSettings?: HookSettings;
  images?: readonly string[];
}

/**
 * Application service that coordinates session lifecycle + runtime execution.
 *
 * Supports multi-session: each sendMessage creates/reuses a SessionContext,
 * allowing concurrent SDK sessions. Abort/resolve operations route by sessionId.
 */
export class SessionOrchestrator {
  private assertRuntimeRegistered(runtime: Session['runtime']): void {
    const available = runtimeRegistry.listRuntimes();
    if (!available.includes(runtime)) {
      throw new Error(
        `Runtime "${runtime}" is not registered. Available runtimes: ${available.join(', ')}`,
      );
    }
  }

  async onProjectSelected(projectPath: string): Promise<void> {
    await claudeFilesService.saveProjectMetadata(projectPath);
    sessionManager.setCurrentProjectPath(projectPath);
    debouncedSync();
  }

  async listSessions(projectPath?: string): Promise<Session[]> {
    const targetPath = projectPath ?? sessionManager.getCurrentProjectPath();
    if (!targetPath) return [];

    if (projectPath) {
      sessionManager.setCurrentProjectPath(projectPath);
    }

    return sessionManager.listSessions(targetPath);
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    const runtimeContext = await runtimeContextService.buildContext({
      projectPath: input.projectPath,
      runtime: input.runtime,
      permissionMode: input.permissionMode,
    });
    this.assertRuntimeRegistered(runtimeContext.runtime);

    const session = await sessionManager.createSession({
      ...input,
      runtime: runtimeContext.runtime,
      permissionMode: runtimeContext.permissionMode,
    });

    // Create worktree if requested
    if (input.useWorktree && worktreeService.isGitRepo(input.projectPath)) {
      const wtResult = await worktreeService.createWorktree(input.projectPath, session.id);
      await sessionManager.updateSessionWorktree(input.projectPath, session.id, {
        worktreePath: wtResult.worktreePath,
        branchName: wtResult.branchName,
        baseBranch: wtResult.baseBranch,
      });
      return { ...session, worktree: { worktreePath: wtResult.worktreePath, branchName: wtResult.branchName, baseBranch: wtResult.baseBranch } };
    }

    return session;
  }

  async resumeSession(sessionId: string): Promise<{ session: Session | null; messages: Message[] }> {
    let projectPath = sessionManager.getCurrentProjectPath();

    if (!projectPath) {
      projectPath = await this.findSessionProjectPath(sessionId);
      if (projectPath) {
        sessionManager.setCurrentProjectPath(projectPath);
      }
    }

    if (!projectPath) {
      throw new Error('No project selected');
    }

    const resumed = await sessionManager.resumeSession(projectPath, sessionId, { loadHistory: true });
    const runtime = resumed.session?.runtime ?? 'claude';
    this.assertRuntimeRegistered(runtime);

    runtimeRegistry.setActiveRuntime(runtime);

    return resumed;
  }

  private async findSessionProjectPath(sessionId: string): Promise<string | null> {
    try {
      const projects = await claudeFilesService.scanExistingProjects();
      for (const project of projects) {
        if (!project.path) continue;
        const sessions = await claudeFilesService.listSessions(project.path);
        if (sessions.some(s => s.id === sessionId)) {
          return project.path;
        }
      }
    } catch {
      // Ignore errors during project scan
    }
    return null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) return;

    // Clean up session context if active
    sessionContextStore.remove(sessionId);
    await sessionManager.deleteSession(projectPath, sessionId);
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) return [];
    return sessionManager.getSessionMessages(projectPath, sessionId);
  }

  /**
   * Send a message to a session. In multi-session mode, creates/reuses a
   * SessionContext so multiple sessions can run concurrently.
   */
  async sendMessage(window: BrowserWindow, input: SendMessageInput): Promise<void> {
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    const activeSessionId = input.sessionId || sessionManager.getCurrentSessionId();
    let targetSessionId = activeSessionId;

    const currentSession = targetSessionId
      ? await sessionManager.getSession(projectPath, targetSessionId)
      : null;

    const runtimeContext = await runtimeContextService.buildContext({
      projectPath,
      sessionId: targetSessionId || undefined,
      runtime: currentSession?.runtime,
      permissionMode: input.permissionMode ?? currentSession?.permissionMode,
    });
    this.assertRuntimeRegistered(runtimeContext.runtime);

    if (!targetSessionId) {
      const newSession = await sessionManager.createSession({
        name: input.content.trim()
          ? input.content.slice(0, 50)
          : (input.images && input.images.length > 0 ? `[Image${input.images.length > 1 ? 's' : ''}]` : 'New Session'),
        projectPath,
        runtime: runtimeContext.runtime,
        permissionMode: runtimeContext.permissionMode,
      });
      targetSessionId = newSession.id;
    }

    const resolvedSessionId: string = targetSessionId!;

    // Get or create a session context for concurrent execution
    const ctx = sessionContextStore.getOrCreate(resolvedSessionId, projectPath);

    // Set the SDK session ID from the session manager for resume
    const activeState = sessionManager.getActiveSession(resolvedSessionId);
    if (activeState?.sdkSessionId) {
      ctx.sdkSessionId = activeState.sdkSessionId;
    } else {
      ctx.sdkSessionId = sessionManager.getSdkSessionId();
    }

    // Store runtime on context for abort/resolve routing (avoids global activeRuntime race)
    ctx.runtimeId = runtimeContext.runtime;
    runtimeRegistry.setActiveRuntime(runtimeContext.runtime);

    const capability = runtimeRegistry.getCapabilities(runtimeContext.runtime);
    const check = capabilityGate.evaluate(runtimeContext, capability);
    if (!check.allowed) {
      throw new Error(check.reasons.join('; '));
    }

    // Use worktree path as cwd if the session has a worktree
    const resolvedSession = await sessionManager.getSession(projectPath, resolvedSessionId);
    const effectiveCwd = resolvedSession?.worktree?.worktreePath ?? projectPath;

    // Runtimes without native file history need us to persist messages (kernel, CLI runtimes)
    const needsExternalPersistence = !capability.supports.nativeFileHistory;
    if (needsExternalPersistence) {
      await sessionManager.persistDraftSession(projectPath, resolvedSessionId);
      const userMessage: Message = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sessionId: resolvedSessionId,
        role: 'user',
        type: 'text',
        content: input.content,
        ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
        timestamp: Date.now(),
      };
      await sessionManager.appendMessage(projectPath, resolvedSessionId, userMessage);
    }

    // Use context-aware startSession — route through per-session runtimeId
    await runtimeRegistry.getAdapter(runtimeContext.runtime).startSession(window, {
      prompt: input.content,
      cwd: effectiveCwd,
      sessionId: resolvedSessionId,
      permissionMode: runtimeContext.permissionMode,
      executionOptions: input.executionOptions,
      hookSettings: input.hookSettings,
      images: input.images,
      onMetadata: async (metadata) => {
        if (!metadata || typeof metadata !== 'object') return;
        if (needsExternalPersistence) {
          await sessionManager.persistRuntimeMetadata(projectPath, resolvedSessionId, {
            runtime: runtimeContext.runtime,
            model: typeof metadata.model === 'string' ? metadata.model : undefined,
            permissionMode:
              typeof metadata.permissionMode === 'string'
                ? (metadata.permissionMode as PermissionMode)
                : runtimeContext.permissionMode,
            cwd: typeof metadata.cwd === 'string' ? metadata.cwd : effectiveCwd,
            tools: Array.isArray(metadata.tools)
              ? metadata.tools.filter((tool): tool is string => typeof tool === 'string')
              : undefined,
          });
          return;
        }
        const sdkSessionId = (metadata as { sessionId?: unknown }).sessionId;
        if (typeof sdkSessionId !== 'string' || !sdkSessionId) return;
        sessionManager.setSdkSessionId(sdkSessionId);
        sessionManager.markSessionPersisted(projectPath, resolvedSessionId);
        await sessionManager.persistRuntimeSessionId(projectPath, resolvedSessionId, sdkSessionId);
      },
      onMessage: async (message) => {
        sessionManager.markSessionPersisted(projectPath, resolvedSessionId);
        // Non-native runtimes: persist each output message to JSONL
        if (needsExternalPersistence && message && !message.isStreamDelta) {
          try {
            await sessionManager.appendMessage(projectPath, resolvedSessionId, message);
          } catch {
            // Ignore persistence errors — don't break the agent loop
          }
        }
      },
      onStatus: (state) => {
        sessionManager.updateSdkState(state);
      },
    }, ctx);

    appPreferencesService.update({ lastSessionId: resolvedSessionId, lastProjectPath: projectPath }).catch(() => { });
  }

  /**
   * Switch the focused session. In multi-session mode, does NOT abort the previous session.
   */
  async switchSession(
    window: BrowserWindow,
    sessionId: string,
  ): Promise<{ session: Session | null; messages: Message[] }> {
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) {
      throw new Error('No project selected');
    }

    // Just change focus — don't abort running sessions
    sessionManager.setFocusedSessionId(sessionId);

    const result = await sessionManager.switchSession(projectPath, sessionId);
    const session = await sessionManager.getSession(projectPath, sessionId);

    const runtime = session?.runtime ?? 'claude';
    this.assertRuntimeRegistered(runtime);
    runtimeRegistry.setActiveRuntime(runtime);

    appPreferencesService.update({ lastSessionId: sessionId, lastProjectPath: projectPath }).catch(() => { });

    return { session, messages: result.messages };
  }

  /** Focus a session without loading history (used when switching tabs). */
  async focusSession(sessionId: string): Promise<void> {
    sessionManager.setFocusedSessionId(sessionId);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (projectPath) {
      appPreferencesService.update({ lastSessionId: sessionId, lastProjectPath: projectPath }).catch(() => { });
    }
  }

  /** Close a session tab — abort if running, remove from active sessions. */
  async closeSessionTab(sessionId: string): Promise<void> {
    sessionContextStore.abort(sessionId);
    sessionContextStore.remove(sessionId);
    sessionManager.unregisterActiveSession(sessionId);
  }

  async scanProjects(): Promise<{ path: string; sessionCount: number; lastAccessed: number }[]> {
    const projects = await claudeFilesService.scanExistingProjects();
    return projects
      .filter((p): p is typeof p & { path: string } => p.path !== null)
      .map(({ path, sessionCount, lastAccessed }) => ({ path, sessionCount, lastAccessed }));
  }

  /** Abort a specific session by ID. */
  abortSession(sessionId: string): void {
    const ctx = sessionContextStore.get(sessionId);
    if (ctx) {
      runtimeRegistry.getAdapter(ctx.runtimeId ?? undefined).abort(ctx);
    }
  }

  /** Abort the focused/current session. */
  abort(): void {
    const focusedId = sessionManager.getFocusedSessionId();
    if (focusedId) {
      this.abortSession(focusedId);
    }
  }

  /** Resolve a permission for a specific session. */
  resolvePermissionForSession(sessionId: string, response: PermissionResponse): void {
    const ctx = sessionContextStore.get(sessionId);
    if (ctx) {
      runtimeRegistry.getAdapter(ctx.runtimeId ?? undefined).resolvePermission(ctx, response);
    }
  }

  /** Resolve permission — routes to focused session. */
  resolvePermission(response: PermissionResponse): void {
    const focusedId = sessionManager.getFocusedSessionId();
    if (focusedId) {
      this.resolvePermissionForSession(focusedId, response);
    }
  }

  resolveAskUserQuestionForSession(sessionId: string, response: AskUserQuestionResponse): void {
    const ctx = sessionContextStore.get(sessionId);
    if (ctx) {
      runtimeRegistry.getAdapter(ctx.runtimeId ?? undefined).resolveAskUserQuestion(ctx, response);
    }
  }

  resolveAskUserQuestion(response: AskUserQuestionResponse): void {
    const focusedId = sessionManager.getFocusedSessionId();
    if (focusedId) {
      this.resolveAskUserQuestionForSession(focusedId, response);
    }
  }

  resolveExitPlanModeForSession(sessionId: string, response: ExitPlanModeResponse): void {
    const ctx = sessionContextStore.get(sessionId);
    if (ctx) {
      runtimeRegistry.getAdapter(ctx.runtimeId ?? undefined).resolveExitPlanMode(ctx, response);
    }
  }

  resolveExitPlanMode(response: ExitPlanModeResponse): void {
    const focusedId = sessionManager.getFocusedSessionId();
    if (focusedId) {
      this.resolveExitPlanModeForSession(focusedId, response);
    }
  }

  async rewindFiles(sessionId: string, userMessageId: string, dryRun?: boolean): Promise<RewindFilesResult> {
    const ctx = sessionContextStore.get(sessionId);
    if (ctx) {
      return runtimeRegistry.getAdapter(ctx.runtimeId ?? undefined).rewindFiles(ctx, userMessageId, dryRun);
    }
    return { canRewind: false, error: 'No active query for this session — cannot rewind.' };
  }
}

export const sessionOrchestrator = new SessionOrchestrator();
