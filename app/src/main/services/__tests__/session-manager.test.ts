import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message, Session } from '@common/types';
import { SessionManager } from '../session';
import { claudeFilesService } from '../claude-files';

vi.mock('../claude-files', () => ({
  claudeFilesService: {
    saveProjectMetadata: vi.fn(),
    createSession: vi.fn(),
    listSessions: vi.fn(),
    getSessionMessages: vi.fn(),
    deleteSession: vi.fn(),
    appendMessage: vi.fn(),
    appendSessionRuntime: vi.fn(),
    getSessionFilePath: vi.fn(),
  },
}));

// Mock fs/promises for extractSdkSessionId
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a draft session without writing JSONL upfront', async () => {
    vi.mocked(claudeFilesService.saveProjectMetadata).mockResolvedValue(undefined);
    vi.mocked(claudeFilesService.listSessions).mockResolvedValue([]);

    const created = await manager.createSession({
      name: 'Draft Session',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
    });

    expect(created.name).toBe('Draft Session');
    expect(created.projectPath).toBe('/project/path');
    expect(claudeFilesService.saveProjectMetadata).toHaveBeenCalledWith('/project/path');
    expect(claudeFilesService.createSession).not.toHaveBeenCalled();

    const listed = await manager.listSessions('/project/path');
    expect(listed.some((session) => session.id === created.id)).toBe(true);
  });

  it('should resume a draft session with empty history', async () => {
    vi.mocked(claudeFilesService.saveProjectMetadata).mockResolvedValue(undefined);
    vi.mocked(claudeFilesService.listSessions).mockResolvedValue([]);

    const draft = await manager.createSession({
      name: 'Draft Resume',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
    });

    const resumed = await manager.resumeSession('/project/path', draft.id, { loadHistory: true });

    expect(resumed.session?.id).toBe(draft.id);
    expect(resumed.messages).toEqual([]);
    expect(manager.getSdkSessionId()).toBeNull();
    expect(claudeFilesService.getSessionMessages).not.toHaveBeenCalled();
  });

  it('should resume an existing session and load history', async () => {
    const session: Session = {
      id: 'session-1',
      name: 'Resume Test',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1000,
      updatedAt: 2000,
    };
    const messages: Message[] = [
      {
        id: 'm1',
        sessionId: 'session-1',
        role: 'user',
        type: 'text',
        content: 'hello',
        timestamp: 1234,
      },
    ];

    vi.mocked(claudeFilesService.listSessions).mockResolvedValue([session]);
    vi.mocked(claudeFilesService.getSessionMessages).mockResolvedValue(messages);
    vi.mocked(claudeFilesService.getSessionFilePath).mockReturnValue('/sessions/session-1.jsonl');

    const { readFile } = await import('node:fs/promises');
    // No system/init message, so sdkSessionId should be null
    vi.mocked(readFile).mockResolvedValue('{"type": "user", "content": "hello"}');

    manager.setCurrentProjectPath('/project/path');
    const resumed = await manager.resumeSession('/project/path', 'session-1', { loadHistory: true });

    expect(resumed.session).toEqual(session);
    expect(resumed.messages).toEqual(messages);
    expect(manager.getCurrentSessionId()).toBe('session-1');
    expect(manager.getCurrentProjectPath()).toBe('/project/path');
    // Without system/init, sdkSessionId should be null (new session behavior)
    expect(manager.getSdkSessionId()).toBeNull();
  });

  it('should extract SDK session ID from system/init message', async () => {
    const session: Session = {
      id: 'file-uuid-123',
      name: 'SDK Session',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1000,
      updatedAt: 2000,
    };

    vi.mocked(claudeFilesService.listSessions).mockResolvedValue([session]);
    vi.mocked(claudeFilesService.getSessionMessages).mockResolvedValue([]);
    vi.mocked(claudeFilesService.getSessionFilePath).mockReturnValue('/sessions/file-uuid-123.jsonl');

    const { readFile } = await import('node:fs/promises');
    // JSONL with system/init containing SDK session ID
    const jsonlContent = [
      '{"type": "session_meta", "name": "SDK Session"}',
      '{"type": "system", "subtype": "init", "session_id": "sdk-session-abc-456", "model": "claude-sonnet-4"}',
      '{"type": "user", "content": "hello"}',
    ].join('\n');
    vi.mocked(readFile).mockResolvedValue(jsonlContent);

    const resumed = await manager.resumeSession('/project/path', 'file-uuid-123', { loadHistory: true });

    expect(resumed.session).toEqual(session);
    // Should extract SDK session ID from system/init message
    expect(manager.getSdkSessionId()).toBe('sdk-session-abc-456');
  });

  it('should throw when resuming a missing session instead of creating a new one', async () => {
    vi.mocked(claudeFilesService.listSessions).mockResolvedValue([]);

    await expect(manager.resumeSession('/project/path', 'missing-session')).rejects.toThrow(
      'Session not found: missing-session',
    );

    expect(claudeFilesService.createSession).not.toHaveBeenCalled();
    expect(claudeFilesService.getSessionMessages).not.toHaveBeenCalled();
  });

  it('should ignore sdk status updates from non-current sessions', async () => {
    vi.mocked(claudeFilesService.saveProjectMetadata).mockResolvedValue(undefined);

    const created = await manager.createSession({
      name: 'Status Session',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
    });

    manager.updateSdkState({
      sessionId: 'other-session',
      status: 'error',
      error: 'wrong session',
    });

    expect(manager.getCurrentSessionId()).toBe(created.id);
    const activeSession = manager.getActiveSession(created.id);
    expect(activeSession?.status).toBe('idle');
    expect(activeSession?.error).toBeNull();
  });

  it('should apply sdk status updates for current session', async () => {
    vi.mocked(claudeFilesService.saveProjectMetadata).mockResolvedValue(undefined);

    const created = await manager.createSession({
      name: 'Current Status Session',
      projectPath: '/project/path',
      runtime: 'claude',
      permissionMode: 'default',
    });

    manager.updateSdkState({
      sessionId: created.id,
      status: 'waiting_permission',
    });

    const activeSession = manager.getActiveSession(created.id);
    expect(activeSession?.status).toBe('waiting_permission');
    expect(activeSession?.error).toBeNull();
  });

  describe('parent-child tracking', () => {
    beforeEach(() => {
      vi.mocked(claudeFilesService.saveProjectMetadata).mockResolvedValue(undefined);
    });

    it('registers a child session under a parent', () => {
      manager.registerChildSession('parent-1', 'child-1');
      manager.registerChildSession('parent-1', 'child-2');

      const children = manager.getChildSessionIds('parent-1');
      expect(children).toContain('child-1');
      expect(children).toContain('child-2');
      expect(children).toHaveLength(2);
    });

    it('returns empty array for session with no children', () => {
      const children = manager.getChildSessionIds('no-children');
      expect(children).toEqual([]);
    });

    it('returns parent session ID for a child', () => {
      manager.registerChildSession('parent-1', 'child-1');

      expect(manager.getParentSessionId('child-1')).toBe('parent-1');
    });

    it('returns null for root session', () => {
      expect(manager.getParentSessionId('root-session')).toBeNull();
    });

    it('unregistering parent cleans up child references', async () => {
      const parent = await manager.createSession({
        name: 'Parent',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
      });

      const child = await manager.createSession({
        name: 'Child',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
        parentSessionId: parent.id,
        role: 'researcher',
      });

      // Verify relationship was established via createSession
      expect(manager.getChildSessionIds(parent.id)).toContain(child.id);
      expect(manager.getParentSessionId(child.id)).toBe(parent.id);

      // Unregister parent
      manager.unregisterActiveSession(parent.id);

      // Child's parent reference should be cleaned up
      expect(manager.getParentSessionId(child.id)).toBeNull();
      expect(manager.getChildSessionIds(parent.id)).toEqual([]);
    });

    it('unregistering child cleans up parent reference', async () => {
      const parent = await manager.createSession({
        name: 'Parent',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
      });

      const child = await manager.createSession({
        name: 'Child',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
        parentSessionId: parent.id,
      });

      // Unregister child
      manager.unregisterActiveSession(child.id);

      // Parent should no longer list the child
      expect(manager.getChildSessionIds(parent.id)).toEqual([]);
      // Child's parent reference should be gone
      expect(manager.getParentSessionId(child.id)).toBeNull();
    });

    it('createSession includes optional hierarchy fields in the session object', async () => {
      const parent = await manager.createSession({
        name: 'Parent',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
      });

      const child = await manager.createSession({
        name: 'Child',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
        parentSessionId: parent.id,
        role: 'researcher',
        isTeamSession: true,
      });

      expect(child.parentSessionId).toBe(parent.id);
      expect(child.role).toBe('researcher');
      expect(child.isTeamSession).toBe(true);
    });

    it('createSession omits hierarchy fields when not provided', async () => {
      const session = await manager.createSession({
        name: 'Regular Session',
        projectPath: '/project/path',
        runtime: 'claude',
        permissionMode: 'default',
      });

      expect(session).not.toHaveProperty('parentSessionId');
      expect(session).not.toHaveProperty('role');
      expect(session).not.toHaveProperty('isTeamSession');
    });
  });
});
