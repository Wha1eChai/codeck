import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeService } from '../claude';
import { MAIN_TO_RENDERER } from '../../../common/ipc-channels';
import type { SessionContext } from '../session-context';

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

vi.mock('../sdk-adapter/env-loader', () => ({
  getSDKEnv: () => ({ ANTHROPIC_API_KEY: 'test-key', CLAUDE_CODE_GIT_BASH_PATH: '/bin/bash' }),
  loadClaudeEnv: () => ({ env: {}, gitBashPath: '' }),
}));

// Mock BrowserWindow
const mockWebContents = {
  send: vi.fn(),
};
const mockWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: mockWebContents,
} as any;

function createMockContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: 'test-session',
    projectPath: '/tmp',
    abortController: null,
    permissionResolver: null,
    askUserQuestionResolver: null,
    exitPlanModeResolver: null,
    queryRef: null,
    sdkSessionId: null,
    sessionMetadata: null,
    permissionStore: null,
    ...overrides,
  };
}

describe('ClaudeService Integration Flow', () => {
  let service: ClaudeService;

  beforeEach(() => {
    service = new ClaudeService();
    vi.clearAllMocks();
  });

  it('should handle a full conversation flow with tools', async () => {
    const realisticStream = [
      // 1. System init (0 messages, extracts metadata)
      {
        type: 'system',
        subtype: 'init',
        session_id: 'session_test',
        model: 'claude-sonnet-4-20250514',
        tools: ['Read', 'Bash'],
        cwd: '/test/project',
        permission_mode: 'default',
      },
      // 2. Assistant thinking + tool_use (fan-out: 2 messages)
      {
        type: 'assistant',
        uuid: 'msg_1',
        parent_tool_use_id: null,
        session_id: 'session_test',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I need to check the file system.' },
            { type: 'tool_use', id: 'toolu_01', name: 'Bash', input: { command: 'ls ./src' } },
          ],
          usage: { input_tokens: 300, output_tokens: 40 },
        },
      },
      // 3. Tool progress (1 message)
      {
        type: 'tool_progress',
        uuid: 'prog_1',
        tool_name: 'Bash',
        tool_use_id: 'toolu_01',
        parent_tool_use_id: null,
        elapsed_time_seconds: 1.5,
        session_id: 'session_test',
      },
      // 4. Tool use summary (1 message — system/text)
      {
        type: 'tool_use_summary',
        uuid: 'sum_1',
        summary: 'file1.ts\nfile2.ts',
        preceding_tool_use_ids: ['toolu_01'],
        session_id: 'session_test',
      },
      // 5. Assistant text response (1 message)
      {
        type: 'assistant',
        uuid: 'msg_2',
        parent_tool_use_id: null,
        session_id: 'session_test',
        message: {
          id: 'msg_2',
          role: 'assistant',
          content: [
            { type: 'text', text: 'I found the files.' },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      // 6. Success result (1 message — usage)
      {
        type: 'result',
        subtype: 'success',
        uuid: 'res_1',
        session_id: 'session_test',
        usage: { input_tokens: 1000, output_tokens: 500 },
        is_error: false,
        result: 'Task completed.',
        duration_ms: 3200,
        duration_api_ms: 3000,
        num_turns: 2,
        total_cost_usd: 0.008,
        stop_reason: 'end_turn',
        modelUsage: {},
        permission_denials: [],
      },
    ];

    async function* generateMessages() {
      for (const msg of realisticStream) {
        yield msg;
      }
    }

    mockQuery.mockReturnValue(generateMessages());
    const ctx = createMockContext({ projectPath: '/test/project' });

    await service.startSession(mockWindow, {
      prompt: 'List files in src',
      cwd: '/test/project',
      permissionMode: 'default',
    }, ctx);

    // Verify query parameters
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'List files in src',
      options: expect.objectContaining({
        cwd: '/test/project',
        permissionMode: 'default',
      }),
    }));

    // Count: 1 streaming + 1 (metadata) + 2 (assistant fan-out) + 1 (progress) + 1 (summary) + 1 (text) + 1 (result usage) + 1 idle = 9
    expect(mockWebContents.send).toHaveBeenCalledTimes(9);

    // First call: streaming status
    expect(mockWebContents.send).toHaveBeenNthCalledWith(1,
      MAIN_TO_RENDERER.CLAUDE_STATUS,
      expect.objectContaining({ status: 'streaming' })
    );

    // Session metadata push (from system/init)
    expect(mockWebContents.send).toHaveBeenNthCalledWith(2,
      MAIN_TO_RENDERER.SESSION_METADATA,
      expect.objectContaining({ sessionId: 'session_test' })
    );

    // Fan-out: thinking block
    expect(mockWebContents.send).toHaveBeenNthCalledWith(3,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        id: 'msg_1_block_0',
        type: 'thinking',
        content: 'I need to check the file system.',
      })
    );

    // Fan-out: tool_use block
    expect(mockWebContents.send).toHaveBeenNthCalledWith(4,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        id: 'msg_1_block_1',
        type: 'tool_use',
        toolName: 'Bash',
        toolInput: { command: 'ls ./src' },
        toolUseId: 'toolu_01',
      })
    );

    // Tool progress
    expect(mockWebContents.send).toHaveBeenNthCalledWith(5,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        type: 'tool_progress',
        toolName: 'Bash',
        content: 'Running... 1.5s',
      })
    );

    // Tool use summary (now system/text)
    expect(mockWebContents.send).toHaveBeenNthCalledWith(6,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        role: 'system',
        type: 'text',
        content: 'file1.ts\nfile2.ts',
      })
    );

    // Assistant text
    expect(mockWebContents.send).toHaveBeenNthCalledWith(7,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        id: 'msg_2_block_0',
        type: 'text',
        content: 'I found the files.',
      })
    );

    // Result usage
    expect(mockWebContents.send).toHaveBeenNthCalledWith(8,
      MAIN_TO_RENDERER.CLAUDE_MESSAGE,
      expect.objectContaining({
        type: 'usage',
      })
    );

    // Last call: idle status
    expect(mockWebContents.send).toHaveBeenNthCalledWith(9,
      MAIN_TO_RENDERER.CLAUDE_STATUS,
      expect.objectContaining({ status: 'idle' })
    );

    // Verify metadata was extracted via context
    expect(ctx.sessionMetadata).toEqual({
      sessionId: 'session_test',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Bash'],
      cwd: '/test/project',
      permissionMode: 'default',
    });

    // Verify SDK session ID was captured in context
    expect(ctx.sdkSessionId).toBe('session_test');
  });

  it('should pass env and resume SDK session ID on second message', async () => {
    // First message — SDK returns session_id in init
    async function* firstTurn() {
      yield {
        type: 'system',
        subtype: 'init',
        session_id: 'sdk_session_abc',
        model: 'claude-sonnet-4-20250514',
        tools: ['Read'],
        cwd: '/project',
        permissionMode: 'default',
      };
      yield {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'First reply' }],
          usage: { input_tokens: 100, output_tokens: 10 },
        },
      };
    }

    mockQuery.mockReturnValue(firstTurn());
    const ctx = createMockContext({ projectPath: '/project' });

    await service.startSession(mockWindow, {
      prompt: 'Hello',
      cwd: '/project',
      permissionMode: 'default',
      sessionId: 'ui-session-1',
    }, ctx);

    expect(ctx.sdkSessionId).toBe('sdk_session_abc');

    // Second message — should resume with SDK session ID from context
    vi.clearAllMocks();

    async function* secondTurn() {
      yield {
        type: 'system',
        subtype: 'init',
        session_id: 'sdk_session_abc',
        model: 'claude-sonnet-4-20250514',
        tools: ['Read'],
        cwd: '/project',
        permissionMode: 'default',
      };
      yield {
        type: 'assistant',
        uuid: 'msg_2',
        message: {
          id: 'msg_2',
          role: 'assistant',
          content: [{ type: 'text', text: 'Second reply' }],
          usage: { input_tokens: 50, output_tokens: 5 },
        },
      };
    }

    mockQuery.mockReturnValue(secondTurn());

    await service.startSession(mockWindow, {
      prompt: 'Follow up',
      cwd: '/project',
      permissionMode: 'default',
      sessionId: 'ui-session-1',
    }, ctx);

    // Verify query was called with resume session ID and env
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Follow up',
      options: expect.objectContaining({
        resume: 'sdk_session_abc',
        env: expect.objectContaining({ ANTHROPIC_API_KEY: 'test-key' }),
        persistSession: true,
      }),
    }));
  });

  it('should clear session state when context is reset', async () => {
    async function* turn() {
      yield {
        type: 'system',
        subtype: 'init',
        session_id: 'sdk_session_xyz',
        model: 'claude-sonnet-4-20250514',
        tools: [],
        permissionMode: 'default',
      };
      yield {
        type: 'assistant',
        uuid: 'msg_1',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Done' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
    }

    mockQuery.mockReturnValue(turn());
    const ctx = createMockContext();

    await service.startSession(mockWindow, {
      prompt: 'Test',
      cwd: '/tmp',
      permissionMode: 'default',
    }, ctx);

    expect(ctx.sdkSessionId).toBe('sdk_session_xyz');
    expect(ctx.sessionMetadata).not.toBeNull();

    // Resetting the context is the caller's responsibility now
    ctx.sdkSessionId = null;
    ctx.sessionMetadata = null;

    expect(ctx.sdkSessionId).toBeNull();
    expect(ctx.sessionMetadata).toBeNull();
  });
});
