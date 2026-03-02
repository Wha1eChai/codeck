import crypto from 'node:crypto';
import type { Session, CreateSessionInput, Message, SessionState, SessionManagerState, WorktreeInfo } from '@common/types';
import type { ActiveSessionState, MultiSessionManagerState } from '@common/multi-session-types';
import { claudeFilesService } from './claude-files';
import { extractSessionMetadata } from './claude-files/session-parser';

export interface ResumeSessionOptions {
  loadHistory?: boolean;
  notifyRenderer?: boolean;
}

/**
 * Session lifecycle manager.
 *
 * Supports both single-session (backward compat) and multi-session modes.
 * In multi-session mode, multiple sessions can be active simultaneously,
 * each tracked in the `activeSessions` map.
 */
export class SessionManager {
  // Legacy single-session state (backward compat)
  private state: SessionManagerState = {
    currentSessionId: null,
    currentProjectPath: null,
    sdkSessionId: null,
    sessionStatus: 'idle',
    currentError: null,
  };

  // Multi-session state
  private activeSessions = new Map<string, ActiveSessionState>();
  private focusedSessionId: string | null = null;

  private listeners: Set<(state: SessionManagerState) => void> = new Set();
  private multiListeners: Set<(state: MultiSessionManagerState) => void> = new Set();
  private draftSessions: Map<string, Session> = new Map();
  private worktreeInfoMap: Map<string, WorktreeInfo> = new Map();

  // ── State Access ──

  getCurrentSessionId(): string | null {
    return this.focusedSessionId ?? this.state.currentSessionId;
  }

  getCurrentProjectPath(): string | null {
    return this.state.currentProjectPath;
  }

  setCurrentProjectPath(projectPath: string): void {
    this.setState({ currentProjectPath: projectPath });
  }

  getSdkSessionId(): string | null {
    if (this.focusedSessionId) {
      return this.activeSessions.get(this.focusedSessionId)?.sdkSessionId ?? null;
    }
    return this.state.sdkSessionId;
  }

  getState(): SessionManagerState {
    return { ...this.state };
  }

  getMultiState(): MultiSessionManagerState {
    const activeSessions: Record<string, ActiveSessionState> = {};
    for (const [id, session] of this.activeSessions) {
      activeSessions[id] = session;
    }
    return {
      activeSessions,
      focusedSessionId: this.focusedSessionId,
      currentProjectPath: this.state.currentProjectPath,
    };
  }

  getFocusedSessionId(): string | null {
    return this.focusedSessionId;
  }

  setFocusedSessionId(sessionId: string | null): void {
    this.focusedSessionId = sessionId;
    if (sessionId) {
      const active = this.activeSessions.get(sessionId);
      this.setState({
        currentSessionId: sessionId,
        sdkSessionId: active?.sdkSessionId ?? null,
        sessionStatus: active?.status ?? 'idle',
        currentError: active?.error ?? null,
      });
    }
    this.notifyMulti();
  }

  // ── Active Session Tracking ──

  registerActiveSession(sessionId: string, projectPath: string): void {
    this.activeSessions.set(sessionId, {
      sessionId,
      projectPath,
      sdkSessionId: null,
      status: 'idle',
      error: null,
    });
    this.notifyMulti();
  }

  unregisterActiveSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    if (this.focusedSessionId === sessionId) {
      // Focus the next available session or null
      const remaining = Array.from(this.activeSessions.keys());
      this.focusedSessionId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    this.notifyMulti();
  }

  updateActiveSessionStatus(sessionId: string, status: SessionState['status'], error?: string): void {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      this.activeSessions.set(sessionId, {
        ...existing,
        status,
        error: error ?? null,
      });
    }
    // Also update legacy state if this is the focused session
    if (sessionId === this.focusedSessionId || sessionId === this.state.currentSessionId) {
      this.setState({
        sessionStatus: status,
        currentError: error ?? null,
      });
    }
    this.notifyMulti();
  }

  updateActiveSessionSdkId(sessionId: string, sdkSessionId: string): void {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      this.activeSessions.set(sessionId, {
        ...existing,
        sdkSessionId,
      });
    }
    if (sessionId === this.focusedSessionId || sessionId === this.state.currentSessionId) {
      this.setState({ sdkSessionId });
    }
    this.notifyMulti();
  }

  getActiveSession(sessionId: string): ActiveSessionState | undefined {
    return this.activeSessions.get(sessionId);
  }

  getActiveSessions(): Map<string, ActiveSessionState> {
    return new Map(this.activeSessions);
  }

  // ── State Subscriptions ──

  subscribe(listener: (state: SessionManagerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeMulti(listener: (state: MultiSessionManagerState) => void): () => void {
    this.multiListeners.add(listener);
    return () => this.multiListeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  private notifyMulti(): void {
    const state = this.getMultiState();
    this.multiListeners.forEach((listener) => listener(state));
  }

  private setState(partial: Partial<SessionManagerState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  // ── Draft Session Tracking ──

  private draftKey(projectPath: string, sessionId: string): string {
    return `${projectPath}::${sessionId}`;
  }

  private registerDraftSession(session: Session): void {
    this.draftSessions.set(this.draftKey(session.projectPath, session.id), session);
  }

  private removeDraftSession(projectPath: string, sessionId: string): void {
    this.draftSessions.delete(this.draftKey(projectPath, sessionId));
  }

  private getDraftSession(projectPath: string, sessionId: string): Session | null {
    return this.draftSessions.get(this.draftKey(projectPath, sessionId)) ?? null;
  }

  private listDraftSessions(projectPath: string): Session[] {
    const prefix = `${projectPath}::`;
    const drafts: Session[] = [];
    for (const [key, session] of this.draftSessions.entries()) {
      if (key.startsWith(prefix)) {
        drafts.push(session);
      }
    }
    return drafts;
  }

  // ── Session Lifecycle ──

  async createSession(input: CreateSessionInput): Promise<Session> {
    const now = Date.now();
    const runtime = input.runtime || 'claude';
    const session: Session = {
      id: crypto.randomUUID(),
      name: input.name,
      projectPath: input.projectPath,
      runtime,
      permissionMode: input.permissionMode,
      createdAt: now,
      updatedAt: now,
    };

    await claudeFilesService.saveProjectMetadata(input.projectPath);
    this.registerDraftSession(session);

    // Register in multi-session tracking
    this.registerActiveSession(session.id, input.projectPath);

    this.setState({
      currentSessionId: session.id,
      currentProjectPath: input.projectPath,
      sdkSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
    });

    this.focusedSessionId = session.id;
    this.notifyMulti();

    return session;
  }

  async resumeSession(
    projectPath: string,
    sessionId: string,
    options: ResumeSessionOptions = {}
  ): Promise<{ session: Session | null; messages: Message[] }> {
    const { loadHistory = true } = options;

    const persistedSessions = await claudeFilesService.listSessions(projectPath);
    const persistedSession = persistedSessions.find((session) => session.id === sessionId) ?? null;
    if (persistedSession) {
      this.removeDraftSession(projectPath, sessionId);
    }

    const draftSession = this.getDraftSession(projectPath, sessionId);
    const session = persistedSession ?? draftSession;

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let messages: Message[] = [];
    if (loadHistory && persistedSession) {
      messages = await claudeFilesService.getSessionMessages(projectPath, sessionId);
    }

    const sdkSessionId = persistedSession
      ? await this.extractSdkSessionId(projectPath, sessionId)
      : null;

    // Register in multi-session tracking
    this.registerActiveSession(sessionId, projectPath);
    if (sdkSessionId) {
      this.updateActiveSessionSdkId(sessionId, sdkSessionId);
    }

    this.setState({
      currentSessionId: sessionId,
      currentProjectPath: projectPath,
      sdkSessionId,
      sessionStatus: 'idle',
      currentError: null,
    });

    this.focusedSessionId = sessionId;
    this.notifyMulti();

    return { session, messages };
  }

  private async extractSdkSessionId(
    projectPath: string,
    sessionId: string,
  ): Promise<string | null> {
    try {
      const filePath = claudeFilesService.getSessionFilePath(projectPath, sessionId);
      const { readFile } = await import('node:fs/promises');
      const metadata = await extractSessionMetadata(
        (p, e) => readFile(p, e),
        filePath,
      );
      return metadata.sdkSessionId ?? null;
    } catch {
      return null;
    }
  }

  async switchSession(projectPath: string, sessionId: string): Promise<{ messages: Message[] }> {
    // In multi-session mode, we don't close the old session, just change focus
    this.focusedSessionId = sessionId;

    const { messages } = await this.resumeSession(projectPath, sessionId);
    return { messages };
  }

  async closeCurrentSession(): Promise<void> {
    this.setState({
      currentSessionId: null,
      sdkSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
    });
  }

  async deleteSession(projectPath: string, sessionId: string): Promise<void> {
    if (this.state.currentSessionId === sessionId) {
      await this.closeCurrentSession();
    }

    this.unregisterActiveSession(sessionId);
    this.removeDraftSession(projectPath, sessionId);
    await claudeFilesService.deleteSession(projectPath, sessionId);
  }

  async listSessions(projectPath: string): Promise<Session[]> {
    const persisted = await claudeFilesService.listSessions(projectPath);
    const persistedIds = new Set(persisted.map((session) => session.id));

    const drafts = this.listDraftSessions(projectPath).filter((session) => !persistedIds.has(session.id));
    for (const session of persisted) {
      this.removeDraftSession(projectPath, session.id);
    }

    return [...persisted, ...drafts].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getSession(projectPath: string, sessionId: string): Promise<Session | null> {
    const draft = this.getDraftSession(projectPath, sessionId);
    if (draft) return draft;

    const sessions = await claudeFilesService.listSessions(projectPath);
    const session = sessions.find((session) => session.id === sessionId) ?? null;
    if (session) {
      // Attach worktree info if available
      const worktree = this.getSessionWorktree(projectPath, sessionId);
      if (worktree) return { ...session, worktree };
    }
    return session;
  }

  async getSessionMessages(projectPath: string, sessionId: string): Promise<Message[]> {
    return claudeFilesService.getSessionMessages(projectPath, sessionId);
  }

  async appendMessage(projectPath: string, sessionId: string, message: Message): Promise<void> {
    await claudeFilesService.appendMessage(projectPath, sessionId, message);
  }

  async persistRuntimeSessionId(
    projectPath: string,
    sessionId: string,
    sdkSessionId: string,
  ): Promise<void> {
    if (!this.getDraftSession(projectPath, sessionId)) {
      await claudeFilesService.appendSessionRuntime(projectPath, sessionId, sdkSessionId);
    }

    this.updateActiveSessionSdkId(sessionId, sdkSessionId);

    if (this.state.currentSessionId === sessionId) {
      this.setState({ sdkSessionId });
    }
  }

  markSessionPersisted(projectPath: string, sessionId: string): void {
    this.removeDraftSession(projectPath, sessionId);
  }

  updateSdkState(state: SessionState): void {
    // Update multi-session map
    this.updateActiveSessionStatus(state.sessionId, state.status, state.error);

    // Legacy single-session compat
    if (this.state.currentSessionId && state.sessionId !== this.state.currentSessionId) {
      return;
    }

    this.setState({
      sessionStatus: state.status,
      currentError: state.error || null,
    });
  }

  setSdkSessionId(sdkSessionId: string | null): void {
    this.setState({ sdkSessionId });
    if (this.focusedSessionId && sdkSessionId) {
      this.updateActiveSessionSdkId(this.focusedSessionId, sdkSessionId);
    }
  }

  // ── Worktree Info ──

  async updateSessionWorktree(projectPath: string, sessionId: string, worktree: WorktreeInfo): Promise<void> {
    this.worktreeInfoMap.set(this.draftKey(projectPath, sessionId), worktree);
    // Also update draft session if it exists
    const draft = this.getDraftSession(projectPath, sessionId);
    if (draft) {
      this.draftSessions.set(this.draftKey(projectPath, sessionId), { ...draft, worktree });
    }
  }

  getSessionWorktree(projectPath: string, sessionId: string): WorktreeInfo | null {
    return this.worktreeInfoMap.get(this.draftKey(projectPath, sessionId)) ?? null;
  }

  removeSessionWorktree(projectPath: string, sessionId: string): void {
    this.worktreeInfoMap.delete(this.draftKey(projectPath, sessionId));
  }
}

export const sessionManager = new SessionManager();
