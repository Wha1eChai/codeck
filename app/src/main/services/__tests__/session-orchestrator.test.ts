import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeCapabilityReport } from '../runtime';
import { SessionOrchestrator } from '../session-orchestrator';
import { claudeFilesService } from '../claude-files';
import { sessionManager } from '../session';
import { runtimeRegistry } from '../runtime';
import { runtimeContextService } from '../runtime-context';
import { capabilityGate } from '../capability-gate';
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
    appendMessage: vi.fn(),
    setSdkSessionId: vi.fn(),
    markSessionPersisted: vi.fn(),
    persistDraftSession: vi.fn(),
    persistRuntimeMetadata: vi.fn(),
    updateSdkState: vi.fn(),
    unregisterActiveSession: vi.fn(),
    persistRuntimeSessionId: vi.fn(),
    registerChildSession: vi.fn(),
    getChildSessionIds: vi.fn().mockReturnValue([]),
    getParentSessionId: vi.fn().mockReturnValue(null),
  },
}));

const { mockAdapter } = vi.hoisted(() => ({
  mockAdapter: {
    id: 'claude',
    getCapabilities: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
    resolveAskUserQuestion: vi.fn(),
    resolveExitPlanMode: vi.fn(),
    rewindFiles: vi.fn(),
  },
}));

vi.mock('../runtime', () => ({
  runtimeRegistry: {
    listRuntimes: vi.fn(),
    setActiveRuntime: vi.fn(),
    getCapabilities: vi.fn(),
    getAdapter: vi.fn().mockReturnValue(mockAdapter),
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
    teamTools: false,
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
    vi.mocked(sessionContextStore.getOrCreate).mockReturnValue({
      sessionId: 'session-1',
      projectPath: '/project',
      runtimeId: 'claude',
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

  it('sends message via startSession with a SessionContext', async () => {
    await orchestrator.sendMessage({} as any, {
      sessionId: 'session-1',
      content: 'hello',
    });

    expect(sessionContextStore.getOrCreate).toHaveBeenCalledWith('session-1', '/project');
    expect(mockAdapter.startSession).toHaveBeenCalledWith(
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

    expect(mockAdapter.startSession).not.toHaveBeenCalled();
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
    expect(mockAdapter.startSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-new',
        prompt: 'create me',
      }),
      expect.anything(),
    );
  });

  it('persists kernel session headers, runtime metadata, and skips stream deltas', async () => {
    vi.mocked(runtimeRegistry.listRuntimes).mockReturnValue(['claude', 'kernel']);
    vi.mocked(runtimeRegistry.getCapabilities).mockReturnValue({
      ...CLAUDE_CAPABILITY,
      runtime: 'kernel',
      supports: { ...CLAUDE_CAPABILITY.supports, nativeFileHistory: false },
    });
    vi.mocked(sessionManager.getSession).mockResolvedValue({
      id: 'session-1',
      name: 'Kernel Session',
      projectPath: '/project',
      runtime: 'kernel',
      permissionMode: 'plan',
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(runtimeContextService.buildContext).mockResolvedValue({
      runtime: 'kernel',
      projectPath: '/project',
      sessionId: 'session-1',
      permissionMode: 'plan',
      settings: {
        theme: 'system',
        defaultPermissionMode: 'default',
        defaultRuntime: 'claude',
      },
      sources: {
        runtime: 'session',
        permissionMode: 'request',
      },
    });

    mockAdapter.startSession.mockImplementationOnce(async (_window, params) => {
      await params.onMetadata?.({
        sessionId: 'session-1',
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'plan',
        cwd: '/project',
        tools: ['Read'],
      });
      await params.onMessage?.({
        id: 'delta-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'text',
        content: 'partial',
        timestamp: 1,
        isStreamDelta: true,
      });
      await params.onMessage?.({
        id: 'final-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'text',
        content: 'final',
        timestamp: 2,
      });
    });

    await orchestrator.sendMessage({} as any, {
      sessionId: 'session-1',
      content: 'hello kernel',
      permissionMode: 'plan',
    });

    expect(sessionManager.persistDraftSession).toHaveBeenCalledWith('/project', 'session-1');
    expect(sessionManager.appendMessage).toHaveBeenCalledWith(
      '/project',
      'session-1',
      expect.objectContaining({
        role: 'user',
        type: 'text',
        content: 'hello kernel',
      }),
    );
    expect(sessionManager.persistRuntimeMetadata).toHaveBeenCalledWith(
      '/project',
      'session-1',
      expect.objectContaining({
        runtime: 'kernel',
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'plan',
      }),
    );
    expect(sessionManager.appendMessage).toHaveBeenCalledTimes(2);
    expect(sessionManager.appendMessage).toHaveBeenLastCalledWith(
      '/project',
      'session-1',
      expect.objectContaining({
        id: 'final-1',
        content: 'final',
      }),
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
    expect(mockAdapter.abort).toHaveBeenCalledWith(ctx);
  });

  it('closeSessionTab cleans up context and unregisters session', async () => {
    await orchestrator.closeSessionTab('session-1');

    expect(sessionContextStore.abort).toHaveBeenCalledWith('session-1');
    expect(sessionContextStore.remove).toHaveBeenCalledWith('session-1');
    expect(sessionManager.unregisterActiveSession).toHaveBeenCalledWith('session-1');
  });

  // ── Team Session Operations ──

  describe('createChildSession', () => {
    it('creates a session with parentSessionId and registers the relationship', async () => {
      vi.mocked(sessionManager.createSession).mockResolvedValue({
        id: 'child-1',
        name: 'Child Session',
        projectPath: '/project',
        runtime: 'claude',
        permissionMode: 'default',
        createdAt: 1,
        updatedAt: 1,
        parentSessionId: 'parent-1',
        role: 'researcher',
      });

      const result = await orchestrator.createChildSession('parent-1', {
        name: 'Child Session',
        role: 'researcher',
        projectPath: '/project',
        permissionMode: 'default',
      });

      expect(result.id).toBe('child-1');
      expect(sessionManager.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Child Session',
          parentSessionId: 'parent-1',
          role: 'researcher',
          projectPath: '/project',
          permissionMode: 'default',
        }),
      );
      expect(sessionManager.registerChildSession).toHaveBeenCalledWith('parent-1', 'child-1');
    });
  });

  describe('getTeamTree', () => {
    it('returns correct parent and children', () => {
      vi.mocked(sessionManager.getChildSessionIds).mockReturnValue(['child-1', 'child-2']);

      const tree = orchestrator.getTeamTree('parent-1');

      expect(tree).toEqual({
        parentSessionId: 'parent-1',
        childSessionIds: ['child-1', 'child-2'],
      });
      expect(sessionManager.getChildSessionIds).toHaveBeenCalledWith('parent-1');
    });

    it('returns empty children array when no children exist', () => {
      vi.mocked(sessionManager.getChildSessionIds).mockReturnValue([]);

      const tree = orchestrator.getTeamTree('parent-1');

      expect(tree).toEqual({
        parentSessionId: 'parent-1',
        childSessionIds: [],
      });
    });
  });

  describe('sendMessageToChild', () => {
    it('validates parent-child relationship and sends message', async () => {
      vi.mocked(sessionManager.getParentSessionId).mockReturnValue('parent-1');
      vi.mocked(sessionManager.getSession).mockResolvedValue({
        id: 'child-1',
        name: 'Child Session',
        projectPath: '/project',
        runtime: 'claude',
        permissionMode: 'default',
        createdAt: 1,
        updatedAt: 1,
      });

      await orchestrator.sendMessageToChild(
        {} as any,
        'parent-1',
        'child-1',
        'hello child',
      );

      expect(sessionManager.getParentSessionId).toHaveBeenCalledWith('child-1');
      expect(mockAdapter.startSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: 'child-1',
          prompt: 'hello child',
        }),
        expect.anything(),
      );
    });

    it('throws when child does not belong to parent', async () => {
      vi.mocked(sessionManager.getParentSessionId).mockReturnValue('other-parent');

      await expect(
        orchestrator.sendMessageToChild(
          {} as any,
          'parent-1',
          'child-1',
          'hello',
        ),
      ).rejects.toThrow('Session child-1 is not a child of parent-1');

      expect(mockAdapter.startSession).not.toHaveBeenCalled();
    });

    it('throws when child has no parent', async () => {
      vi.mocked(sessionManager.getParentSessionId).mockReturnValue(null);

      await expect(
        orchestrator.sendMessageToChild(
          {} as any,
          'parent-1',
          'child-1',
          'hello',
        ),
      ).rejects.toThrow('Session child-1 is not a child of parent-1');
    });
  });
});
