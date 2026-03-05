import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeRuntimeAdapter } from '../claude-runtime-adapter';
import type { ClaudeService } from '../../claude';
import type { SessionContext } from '../../session-context';

function createMockClaudeService(): ClaudeService {
  return {
    startSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
    resolveAskUserQuestion: vi.fn(),
    resolveExitPlanMode: vi.fn(),
    rewindFiles: vi.fn().mockResolvedValue({ canRewind: true }),
    reloadEnv: vi.fn(),
  } as unknown as ClaudeService;
}

function createMockContext(sessionId = 'test-session'): SessionContext {
  return {
    sessionId,
    projectPath: '/test-project',
    abortController: null,
    permissionResolver: null,
    askUserQuestionResolver: null,
    exitPlanModeResolver: null,
    queryRef: null,
    sdkSessionId: null,
    sessionMetadata: null,
    permissionStore: null,
  } as SessionContext;
}

describe('ClaudeRuntimeAdapter', () => {
  let mockService: ClaudeService;
  let adapter: ClaudeRuntimeAdapter;

  beforeEach(() => {
    mockService = createMockClaudeService();
    adapter = new ClaudeRuntimeAdapter(mockService);
  });

  it('should have id "claude"', () => {
    expect(adapter.id).toBe('claude');
  });

  it('should report expected capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.runtime).toBe('claude');
    expect(caps.supports.resume).toBe(true);
    expect(caps.supports.permissionPrompt).toBe(true);
    expect(caps.supports.streamDelta).toBe(true);
    expect(caps.supportedPermissionModes).toContain('default');
    expect(caps.supportedPermissionModes).toContain('bypassPermissions');
  });

  it('delegates startSession to ClaudeService', async () => {
    const window = {} as any;
    const params = {
      prompt: 'hello',
      cwd: '/project',
      permissionMode: 'default' as const,
    };
    const ctx = createMockContext();

    await adapter.startSession(window, params, ctx);

    expect(mockService.startSession).toHaveBeenCalledWith(window, params, ctx);
  });

  it('delegates abort to ClaudeService', () => {
    const ctx = createMockContext();
    adapter.abort(ctx);
    expect(mockService.abort).toHaveBeenCalledWith(ctx);
  });

  it('delegates resolvePermission to ClaudeService', () => {
    const ctx = createMockContext();
    const response = { requestId: 'r1', allowed: true };
    adapter.resolvePermission(ctx, response);
    expect(mockService.resolvePermission).toHaveBeenCalledWith(ctx, response);
  });

  it('delegates resolveAskUserQuestion to ClaudeService', () => {
    const ctx = createMockContext();
    const response = { requestId: 'r1', answers: { q1: 'a1' }, cancelled: false };
    adapter.resolveAskUserQuestion(ctx, response);
    expect(mockService.resolveAskUserQuestion).toHaveBeenCalledWith(
      ctx,
      response,
    );
  });

  it('delegates resolveExitPlanMode to ClaudeService', () => {
    const ctx = createMockContext();
    const response = { requestId: 'r1', allowed: true };
    adapter.resolveExitPlanMode(ctx, response);
    expect(mockService.resolveExitPlanMode).toHaveBeenCalledWith(ctx, response);
  });

  it('delegates rewindFiles to ClaudeService', async () => {
    const ctx = createMockContext();
    const result = await adapter.rewindFiles(ctx, 'msg-1', true);
    expect(mockService.rewindFiles).toHaveBeenCalledWith(ctx, 'msg-1', true);
    expect(result).toEqual({ canRewind: true });
  });
});
