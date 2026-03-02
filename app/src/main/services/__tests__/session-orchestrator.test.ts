import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeCapabilityReport } from '../runtime';
import { SessionOrchestrator } from '../session-orchestrator';
import { claudeFilesService } from '../claude-files';
import { sessionManager } from '../session';
import { runtimeRegistry } from '../runtime';
import { runtimeContextService } from '../runtime-context';
import { capabilityGate } from '../capability-gate';
import { claudeService } from '../claude';
import { sessionContextStore } from '../session-context';

vi.mock('../claude-files', () => ({
  claudeFilesService: {
    saveProjectMetadata: vi.fn(),
    scanExistingProjects: vi.fn(),
  },
}));

vi.mock('../session', () => ({
  sessionManager: {
    setCurrentProjectPath: vi.fn(),
    getCurrentProjectPath: vi.fn(),
    getCurrentSessionId: vi.fn(),
    getSdkSessionId: vi.fn(),
    getFocusedSessionId: vi.fn(),
    setFocusedSessionId: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    resumeSession: vi.fn(),
    switchSession: vi.fn(),
    deleteSession: vi.fn(),
    getSessionMessages: vi.fn(),
    getSession: vi.fn(),
    getActiveSession: vi.fn(),
    setSdkSessionId: vi.fn(),
    markSessionPersisted: vi.fn(),
    updateSdkState: vi.fn(),
    unregisterActiveSession: vi.fn(),
    persistRuntimeSessionId: vi.fn(),
  },
}));

vi.mock('../runtime', () => ({
  runtimeRegistry: {
    listRuntimes: vi.fn(),
    setActiveRuntime: vi.fn(),
    setResumeSessionId: vi.fn(),
    getCapabilities: vi.fn(),
    startSession: vi.fn(),
    resetSession: vi.fn(),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
  },
}));

vi.mock('../runtime-context', () => ({
  runtimeContextService: {
    buildContext: vi.fn(),
  },
}));

vi.mock('../capability-gate', () => ({
  capabilityGate: {
    evaluate: vi.fn(),
  },
}));

vi.mock('../claude', () => ({
  claudeService: {
    startSessionWithContext: vi.fn(),
    abortContext: vi.fn(),
    resolvePermissionForContext: vi.fn(),
    resolveAskUserQuestionForContext: vi.fn(),
    resolveExitPlanModeForContext: vi.fn(),
    resolveAskUserQuestion: vi.fn(),
    resolveExitPlanMode: vi.fn(),
    rewindFiles: vi.fn(),
    rewindFilesForContext: vi.fn(),
  },
}));

vi.mock('../session-context', () => ({
  sessionContextStore: {
    getOrCreate: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    abort: vi.fn(),
  },
}));

vi.mock('../app-preferences', () => ({
  appPreferencesService: {
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

const CLAUDE_CAPABILITY: RuntimeCapabilityReport = {
  runtime: 'claude',
  supports: {
    resume: true,
    permissionPrompt: true,
    streamDelta: true,
    nativeFileHistory: true,
    checkpointing: true,
    hooks: true,
    modelSelection: true,
    embeddedTerminal: true,
  },
  supportedPermissionModes: ['default'],
};

describe('SessionOrchestrator', () => {
  let orchestrator: SessionOrchestrator;

  beforeEach(() => {
    orchestrator = new SessionOrchestrator();
    vi.clearAllMocks();

    vi.mocked(runtimeRegistry.listRuntimes).mockReturnValue(['claude']);
    vi.mocked(runtimeRegistry.getCapabilities).mockReturnValue(CLAUDE_CAPABILITY);
    vi.mocked(capabilityGate.evaluate).mockReturnValue({
      allowed: true,
      reasons: [],
      capability: CLAUDE_CAPABILITY,
    });

    vi.mocked(sessionManager.getCurrentProjectPath).mockReturnValue('/project');
    vi.mocked(sessionManager.getCurrentSessionId).mockReturnValue('session-1');
    vi.mocked(sessionManager.getSdkSessionId).mockReturnValue(null);
    vi.mocked(sessionManager.getFocusedSessionId).mockReturnValue(null);
    vi.mocked(sessionManager.getActiveSession).mockReturnValue(undefined);
    vi.mocked(sessionManager.getSession).mockResolvedValue({
      id: 'session-1',
      name: 'Session 1',
      projectPath: '/project',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(claudeService.startSessionWithContext).mockResolvedValue(undefined);
    vi.mocked(sessionContextStore.getOrCreate).mockReturnValue({
      sessionId: 'session-1',
      projectPath: '/project',
      abortController: null,
      permissionResolver: null,
      askUserQuestionResolver: null,
      exitPlanModeResolver: null,
      queryRef: null,
      sdkSessionId: null,
      sessionMetadata: null,
      permissionStore: null,
    });
    vi.mocked(runtimeContextService.buildContext).mockResolvedValue({
      runtime: 'claude',
      projectPath: '/project',
      sessionId: 'session-1',
      permissionMode: 'default',
      settings: {
        theme: 'system',
        defaultPermissionMode: 'default',
        defaultRuntime: 'claude',
      },
      sources: {
        runtime: 'request',
        permissionMode: 'request',
      },
    });
  });

  it('sends message via startSessionWithContext with a SessionContext', async () => {
    await orchestrator.sendMessage({} as any, {
      sessionId: 'session-1',
      content: 'hello',
    });

    expect(sessionContextStore.getOrCreate).toHaveBeenCalledWith('session-1', '/project');
    expect(claudeService.startSessionWithContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        prompt: 'hello',
      }),
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });

  it('throws when capability gate rejects the runtime context', async () => {
    vi.mocked(capabilityGate.evaluate).mockReturnValue({
      allowed: false,
      reasons: ['Runtime "claude" does not support permission mode "plan"'],
      capability: CLAUDE_CAPABILITY,
    });

    await expect(
      orchestrator.sendMessage({} as any, {
        sessionId: 'session-1',
        content: 'blocked',
        permissionMode: 'plan',
      }),
    ).rejects.toThrow('Runtime "claude" does not support permission mode "plan"');

    expect(claudeService.startSessionWithContext).not.toHaveBeenCalled();
  });

  it('creates a new session when no active session exists', async () => {
    vi.mocked(sessionManager.getCurrentSessionId).mockReturnValue(null);
    vi.mocked(sessionManager.getSession).mockResolvedValue(null);
    vi.mocked(sessionManager.createSession).mockResolvedValue({
      id: 'session-new',
      name: 'New Session',
      projectPath: '/project',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1,
      updatedAt: 1,
    });

    await orchestrator.sendMessage({} as any, {
      sessionId: '',
      content: 'create me',
    });

    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'create me',
        projectPath: '/project',
        runtime: 'claude',
        permissionMode: 'default',
      }),
    );
    expect(claudeService.startSessionWithContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-new',
        prompt: 'create me',
      }),
      expect.anything(),
    );
  });

  it('rejects createSession when runtime is not registered', async () => {
    vi.mocked(runtimeRegistry.listRuntimes).mockReturnValue(['claude']);
    vi.mocked(runtimeContextService.buildContext).mockResolvedValue({
      runtime: 'codex',
      projectPath: '/project',
      permissionMode: 'default',
      settings: {
        theme: 'system',
        defaultPermissionMode: 'default',
        defaultRuntime: 'claude',
      },
      sources: {
        runtime: 'request',
        permissionMode: 'request',
      },
    });

    await expect(
      orchestrator.createSession({
        name: 'new',
        projectPath: '/project',
        runtime: 'codex',
        permissionMode: 'default',
      }),
    ).rejects.toThrow('Runtime "codex" is not registered');

    expect(sessionManager.createSession).not.toHaveBeenCalled();
  });

  it('throws when project path is missing during sendMessage', async () => {
    vi.mocked(sessionManager.getCurrentProjectPath).mockReturnValue(null);

    await expect(
      orchestrator.sendMessage({} as any, {
        sessionId: 'session-1',
        content: 'hello',
      }),
    ).rejects.toThrow('No project selected');
  });

  it('forwards project metadata selection to storage and session state', async () => {
    await orchestrator.onProjectSelected('/project/new');

    expect(claudeFilesService.saveProjectMetadata).toHaveBeenCalledWith('/project/new');
    expect(sessionManager.setCurrentProjectPath).toHaveBeenCalledWith('/project/new');
  });

  it('switchSession changes focus and delegates to sessionManager', async () => {
    const messages = [
      { id: 'm1', sessionId: 'session-2', role: 'user' as const, type: 'text' as const, content: 'hi', timestamp: 1 },
    ];
    vi.mocked(sessionManager.switchSession).mockResolvedValue({ messages });
    vi.mocked(sessionManager.getSession).mockResolvedValue({
      id: 'session-2',
      name: 'Session 2',
      projectPath: '/project',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1,
      updatedAt: 2,
    });

    const result = await orchestrator.switchSession({} as any, 'session-2');

    expect(sessionManager.setFocusedSessionId).toHaveBeenCalledWith('session-2');
    expect(sessionManager.switchSession).toHaveBeenCalledWith('/project', 'session-2');
    expect(runtimeRegistry.setActiveRuntime).toHaveBeenCalledWith('claude');
    expect(result.session?.id).toBe('session-2');
    expect(result.messages).toEqual(messages);
  });

  it('switchSession throws when no project is selected', async () => {
    vi.mocked(sessionManager.getCurrentProjectPath).mockReturnValue(null);

    await expect(
      orchestrator.switchSession({} as any, 'session-2'),
    ).rejects.toThrow('No project selected');
  });

  it('scanProjects filters out null-path entries', async () => {
    vi.mocked(claudeFilesService.scanExistingProjects).mockResolvedValue([
      { hash: 'a', path: '/project-a', sessionCount: 2, lastAccessed: 100 },
      { hash: 'b', path: null, sessionCount: 0, lastAccessed: 50 },
      { hash: 'c', path: '/project-c', sessionCount: 1, lastAccessed: 200 },
    ]);

    const result = await orchestrator.scanProjects();

    expect(result).toEqual([
      { path: '/project-a', sessionCount: 2, lastAccessed: 100 },
      { path: '/project-c', sessionCount: 1, lastAccessed: 200 },
    ]);
  });

  it('abortSession targets the correct session context', () => {
    const ctx = { sessionId: 'session-1', abortController: new AbortController() } as any;
    vi.mocked(sessionContextStore.get).mockReturnValue(ctx);

    orchestrator.abortSession('session-1');

    expect(sessionContextStore.get).toHaveBeenCalledWith('session-1');
    expect(claudeService.abortContext).toHaveBeenCalledWith(ctx);
  });

  it('closeSessionTab cleans up context and unregisters session', async () => {
    await orchestrator.closeSessionTab('session-1');

    expect(sessionContextStore.abort).toHaveBeenCalledWith('session-1');
    expect(sessionContextStore.remove).toHaveBeenCalledWith('session-1');
    expect(sessionManager.unregisterActiveSession).toHaveBeenCalledWith('session-1');
  });
});
