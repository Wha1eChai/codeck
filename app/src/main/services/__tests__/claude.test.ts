import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeService } from '../claude';
import { MAIN_TO_RENDERER } from '../../../common/ipc-channels';
import crypto from 'node:crypto';

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

vi.mock('../sdk-adapter/env-loader', () => ({
  getSDKEnv: () => ({ ANTHROPIC_API_KEY: 'test-key', CLAUDE_CODE_GIT_BASH_PATH: '/bin/bash' }),
  loadClaudeEnv: () => ({ env: {}, gitBashPath: '' }),
}));

vi.mock('../app-preferences', () => ({
  appPreferencesService: {
    get: vi.fn().mockResolvedValue({
      theme: 'system',
      defaultPermissionMode: 'default',
      defaultRuntime: 'claude',
      checkpointEnabled: true,
    }),
  },
}));

vi.mock('../config-bridge', () => ({
  configReader: {
    getAllAgents: vi.fn().mockResolvedValue([]),
    getMcpServers: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../claude-files', () => ({
  claudeFilesService: {
    getProjectMetadata: vi.fn().mockResolvedValue({}),
    updateProjectMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock BrowserWindow
const mockWebContents = {
  send: vi.fn(),
};
const mockWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: mockWebContents,
} as any;

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    service = new ClaudeService();
    vi.clearAllMocks();
  });

  it('should stream messages from SDK to Renderer', async () => {
    const mockMessages = [
      {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 100, output_tokens: 10 },
        },
      },
      {
        type: 'assistant',
        uuid: 'msg_2',
        message: {
          id: 'msg_2',
          role: 'assistant',
          content: [{ type: 'text', text: 'World' }],
          usage: { input_tokens: 50, output_tokens: 5 },
        },
      },
    ];

    async function* generateMessages() {
      for (const msg of mockMessages) {
        yield msg;
      }
    }

    mockQuery.mockReturnValue(generateMessages());

    await service.startSession(mockWindow, {
      prompt: 'Test prompt',
      cwd: '/tmp',
      permissionMode: 'default',
    });

    // Check if query was called with correct params
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Test prompt',
      options: expect.objectContaining({
        cwd: '/tmp',
        permissionMode: 'default',
      }),
    }));

    // streaming status + 2 messages (each assistant has 1 text block) + idle status = 4 total
    expect(mockWebContents.send).toHaveBeenCalledTimes(4);

    // Verify streaming status was sent first
    expect(mockWebContents.send).toHaveBeenNthCalledWith(1,
      MAIN_TO_RENDERER.CLAUDE_STATUS,
      expect.objectContaining({ status: 'streaming' })
    );

    // Verify messages
    expect(mockWebContents.send).toHaveBeenCalledWith(
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({ content: 'Hello' })
    );
    expect(mockWebContents.send).toHaveBeenCalledWith(
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({ content: 'World' })
    );

    // Verify idle status was sent last
    expect(mockWebContents.send).toHaveBeenLastCalledWith(
      MAIN_TO_RENDERER.CLAUDE_STATUS,
      expect.objectContaining({ status: 'idle' })
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('SDK Failure');
    mockQuery.mockImplementation(async function* () {
      throw error;
    });

    await service.startSession(mockWindow, {
      prompt: 'Crash me',
      cwd: '/tmp',
      permissionMode: 'default',
    });

    expect(mockWebContents.send).toHaveBeenCalledWith(
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        type: 'error',
        content: 'SDK Failure',
      })
    );

    // Should also send error status
    expect(mockWebContents.send).toHaveBeenCalledWith(
      MAIN_TO_RENDERER.CLAUDE_STATUS,
      expect.objectContaining({ status: 'error' })
    );
  });

  it('should support aborting the session', async () => {
    let abortControllerPassed: AbortController | undefined;
    let queryReached = false;

    mockQuery.mockImplementation(async function* ({ options }) {
      abortControllerPassed = options?.abortController;
      queryReached = true;
      yield {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Start' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const promise = service.startSession(mockWindow, {
      prompt: 'Long run',
      cwd: '/tmp',
      permissionMode: 'default',
    });

    // Wait until the query is actually reached (async setup may take microtasks)
    while (!queryReached) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    service.abort();

    await promise;

    expect(abortControllerPassed).toBeDefined();
    expect(abortControllerPassed?.signal.aborted).toBe(true);
  });

  it('should extract session metadata from init message', async () => {
    async function* generateMessages() {
      yield {
        type: 'system',
        subtype: 'init',
        session_id: 'session_abc',
        model: 'claude-sonnet-4-20250514',
        tools: ['Read', 'Write'],
        cwd: '/project',
        permission_mode: 'default',
      };
      yield {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Ready' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    }

    mockQuery.mockReturnValue(generateMessages());

    await service.startSession(mockWindow, {
      prompt: 'Hello',
      cwd: '/project',
      permissionMode: 'default',
    });

    const metadata = service.getSessionMetadata();
    expect(metadata).toEqual({
      sessionId: 'session_abc',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write'],
      cwd: '/project',
      permissionMode: 'default',
    });
  });

  it('should fan-out multi-block assistant messages', async () => {
    async function* generateMessages() {
      yield {
        type: 'assistant',
        uuid: 'msg_multi',
        message: {
          id: 'msg_multi',
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me think...' },
            { type: 'text', text: 'Here is my answer.' },
          ],
          usage: { input_tokens: 200, output_tokens: 50 },
        },
      };
    }

    mockQuery.mockReturnValue(generateMessages());

    await service.startSession(mockWindow, {
      prompt: 'Test',
      cwd: '/tmp',
      permissionMode: 'default',
    });

    // streaming + 2 fan-out messages + idle = 4
    expect(mockWebContents.send).toHaveBeenCalledTimes(4);

    expect(mockWebContents.send).toHaveBeenNthCalledWith(2,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        id: 'msg_multi_block_0',
        type: 'thinking',
        content: 'Let me think...',
      })
    );

    expect(mockWebContents.send).toHaveBeenNthCalledWith(3,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        id: 'msg_multi_block_1',
        type: 'text',
        content: 'Here is my answer.',
      })
    );
  });

  it('should invoke onMessage callback for each parsed message', async () => {
    async function* generateMessages() {
      yield {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Persist me' }],
          usage: { input_tokens: 20, output_tokens: 10 },
        },
      };
    }

    mockQuery.mockReturnValue(generateMessages());
    const onMessage = vi.fn();

    await service.startSession(mockWindow, {
      prompt: 'Test persistence callback',
      cwd: '/tmp',
      permissionMode: 'default',
      onMessage,
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: expect.any(String),
        content: 'Persist me',
      }),
    );
  });

  it('should prefer stream_event state machine and avoid assistant echo duplicates', async () => {
    async function* generateMessages() {
      yield {
        type: 'stream_event',
        uuid: 'ev_1',
        event: {
          type: 'message_start',
          message: { id: 'stream_msg_1' },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_2',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_3',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hel' },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_4',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'lo' },
        },
      };
      yield {
        type: 'assistant',
        uuid: 'assistant_echo',
        message: {
          id: 'stream_msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 20, output_tokens: 5 },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_5',
        event: {
          type: 'content_block_stop',
          index: 0,
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        uuid: 'res_1',
        usage: { input_tokens: 20, output_tokens: 5 },
        is_error: false,
      };
    }

    mockQuery.mockReturnValue(generateMessages());

    await service.startSession(mockWindow, {
      prompt: 'stream',
      cwd: '/tmp',
      permissionMode: 'default',
      sessionId: 'ui-session-stream',
    });

    const messageCalls = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.CLAUDE_MESSAGE,
    );

    // 3 stream updates for the same block id + 1 usage message.
    expect(messageCalls).toHaveLength(4);
    expect(messageCalls[0][1]).toMatchObject({
      id: 'stream_msg_1_block_0',
      type: 'text',
      content: 'Hel',
      isStreamDelta: true,
    });
    expect(messageCalls[1][1]).toMatchObject({
      id: 'stream_msg_1_block_0',
      type: 'text',
      content: 'Hello',
      isStreamDelta: true,
    });
    expect(messageCalls[2][1]).toMatchObject({
      id: 'stream_msg_1_block_0',
      type: 'text',
      content: 'Hello',
      isStreamDelta: false,
    });
    expect(messageCalls[3][1]).toMatchObject({
      type: 'usage',
    });

    // No duplicate assistant fan-out from assistant echo.
    const assistantMessages = messageCalls
      .map(([, payload]) => payload)
      .filter((msg) => msg.role === 'assistant');
    expect(assistantMessages).toHaveLength(3);
  });

  it('should reset stream parser state between startSession calls', async () => {
    async function* firstRun() {
      yield {
        type: 'stream_event',
        uuid: 'ev_1',
        event: {
          type: 'message_start',
          message: { id: 'shared_stream_msg' },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_2',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      };
      yield {
        type: 'stream_event',
        uuid: 'ev_3',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'first turn' },
        },
      };
    }

    mockQuery.mockReturnValueOnce(firstRun());
    await service.startSession(mockWindow, {
      prompt: 'first',
      cwd: '/tmp',
      permissionMode: 'default',
      sessionId: 'session-a',
    });

    vi.clearAllMocks();

    async function* secondRun() {
      yield {
        type: 'assistant',
        uuid: 'assistant_2',
        message: {
          id: 'shared_stream_msg',
          role: 'assistant',
          content: [{ type: 'text', text: 'second turn final' }],
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      };
    }

    mockQuery.mockReturnValueOnce(secondRun());
    await service.startSession(mockWindow, {
      prompt: 'second',
      cwd: '/tmp',
      permissionMode: 'default',
      sessionId: 'session-b',
    });

    const secondMessageCalls = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.CLAUDE_MESSAGE,
    );
    expect(secondMessageCalls).toHaveLength(1);
    expect(secondMessageCalls[0][1]).toMatchObject({
      id: 'assistant_2_block_0',
      content: 'second turn final',
      sessionId: 'session-b',
    });
  });

  it('should reuse remembered permission decisions within the same project', async () => {
    let toolCallCount = 0;
    let queryReached = false;

    mockQuery.mockImplementation(async function* ({ options }) {
      toolCallCount += 1;
      queryReached = true;
      await options.canUseTool('Read', { file_path: '/tmp/test.ts' }, {
        signal: new AbortController().signal,
        toolUseID: `toolu_${toolCallCount}`,
      });

      yield {
        type: 'assistant',
        uuid: `msg_${toolCallCount}`,
        message: {
          id: `msg_${toolCallCount}`,
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    });

    queryReached = false;
    const firstRun = service.startSession(mockWindow, {
      prompt: 'first',
      cwd: '/tmp',
      sessionId: 'session-remember',
      permissionMode: 'default',
    });

    while (!queryReached) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    service.resolvePermission({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
    });
    await firstRun;

    const permissionRequestsAfterFirstRun = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.PERMISSION_REQUEST,
    ).length;
    expect(permissionRequestsAfterFirstRun).toBe(1);

    // Same project → persistent permission store reused, no new prompt
    await service.startSession(mockWindow, {
      prompt: 'second',
      cwd: '/tmp',
      sessionId: 'session-remember',
      permissionMode: 'default',
    });

    const permissionRequestsAfterSecondRun = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.PERMISSION_REQUEST,
    ).length;
    expect(permissionRequestsAfterSecondRun).toBe(1);
  });

  it('should isolate remembered permissions across different projects', async () => {
    let queryReached = false;
    mockQuery.mockImplementation(async function* ({ options }) {
      queryReached = true;
      await options.canUseTool('Read', { file_path: '/tmp/test.ts' }, {
        signal: new AbortController().signal,
        toolUseID: crypto.randomUUID(),
      });

      yield {
        type: 'assistant',
        uuid: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    });

    // First project
    queryReached = false;
    const firstRun = service.startSession(mockWindow, {
      prompt: 'first',
      cwd: '/project-a',
      sessionId: 'session-a',
      permissionMode: 'default',
    });

    while (!queryReached) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    service.resolvePermission({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
    });
    await firstRun;

    // Different project → new permission store, should prompt again
    queryReached = false;
    const secondRun = service.startSession(mockWindow, {
      prompt: 'second',
      cwd: '/project-b',
      sessionId: 'session-b',
      permissionMode: 'default',
    });

    while (!queryReached) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    service.resolvePermission({
      requestId: 'r2',
      allowed: true,
      rememberForSession: true,
    });
    await secondRun;

    const permissionRequests = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.PERMISSION_REQUEST,
    ).length;
    expect(permissionRequests).toBe(2);
  });

  it('should persist permission decisions across sessions for the same project', async () => {
    let queryReached = false;
    mockQuery.mockImplementation(async function* ({ options }) {
      queryReached = true;
      await options.canUseTool('Read', { file_path: '/tmp/test.ts' }, {
        signal: new AbortController().signal,
        toolUseID: crypto.randomUUID(),
      });

      yield {
        type: 'assistant',
        uuid: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    });

    queryReached = false;
    const firstRun = service.startSession(mockWindow, {
      prompt: 'first',
      cwd: '/tmp',
      sessionId: 'session-reset',
      permissionMode: 'default',
    });
    while (!queryReached) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    service.resolvePermission({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
    });
    await firstRun;

    // resetSession does NOT clear project-level permissions
    service.resetSession();

    // Same project → permissions still remembered
    await service.startSession(mockWindow, {
      prompt: 'second',
      cwd: '/tmp',
      sessionId: 'session-reset',
      permissionMode: 'default',
    });

    const permissionRequests = mockWebContents.send.mock.calls.filter(
      ([channel]) => channel === MAIN_TO_RENDERER.PERMISSION_REQUEST,
    ).length;
    // Only 1 prompt — second session reuses the remembered decision
    expect(permissionRequests).toBe(1);
  });
});
