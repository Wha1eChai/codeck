// ============================================================
// SDK 消息 Fixtures — 基于真实 SDK 输出结构的测试数据
// ============================================================

import type {
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKSystemInit,
  SDKSystemStatus,
  SDKSystemCompactBoundary,
  SDKSystemHookStarted,
  SDKSystemHookProgress,
  SDKSystemHookResponse,
  SDKStreamEvent,
  SDKToolProgress,
  SDKToolUseSummary,
  SDKContentBlock,
} from '../sdk-types'

// ── Content Blocks ──

export const textBlock: SDKContentBlock = {
  type: 'text',
  text: 'Hello, I can help with that.',
}

export const thinkingBlock: SDKContentBlock = {
  type: 'thinking',
  thinking: 'I need to analyze the file structure first.',
}

export const toolUseBlock: SDKContentBlock = {
  type: 'tool_use',
  id: 'toolu_01ABC',
  name: 'Read',
  input: { file_path: '/src/index.ts' },
}

export const toolResultBlock: SDKContentBlock = {
  type: 'tool_result',
  tool_use_id: 'toolu_01ABC',
  content: 'export default function main() {}',
  is_error: false,
}

export const toolResultErrorBlock: SDKContentBlock = {
  type: 'tool_result',
  tool_use_id: 'toolu_01DEF',
  content: 'File not found',
  is_error: true,
}

export const unknownBlock: SDKContentBlock = {
  type: 'some_future_block',
  data: { foo: 'bar' },
}

// ── Assistant Messages ──

export const assistantTextOnly: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_text_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_text_001',
    role: 'assistant',
    content: [textBlock],
    usage: { input_tokens: 100, output_tokens: 25 },
  },
}

export const assistantWithThinking: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_think_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_think_001',
    role: 'assistant',
    content: [thinkingBlock, textBlock],
    usage: { input_tokens: 200, output_tokens: 50 },
  },
}

export const assistantWithToolUse: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_tool_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_tool_001',
    role: 'assistant',
    content: [thinkingBlock, toolUseBlock],
    usage: { input_tokens: 300, output_tokens: 40 },
  },
}

export const assistantMultiBlock: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_multi_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_multi_001',
    role: 'assistant',
    content: [thinkingBlock, textBlock, toolUseBlock],
    usage: {
      input_tokens: 500,
      output_tokens: 100,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 50,
    },
  },
}

export const assistantEmptyContent: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_empty_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_empty_001',
    role: 'assistant',
    content: [],
    usage: { input_tokens: 10, output_tokens: 0 },
  },
}

export const assistantWithUnknownBlock: SDKAssistantMessage = {
  type: 'assistant',
  uuid: 'msg_unknown_001',
  parent_tool_use_id: null,
  session_id: 'session_abc',
  message: {
    id: 'msg_unknown_001',
    role: 'assistant',
    content: [textBlock, unknownBlock],
    usage: { input_tokens: 50, output_tokens: 10 },
  },
}

// ── User Messages ──

export const userStringContent: SDKUserMessage = {
  type: 'user',
  uuid: 'msg_user_001',
  message: {
    role: 'user',
    content: 'Please read the file src/index.ts',
  },
}

export const userBlockContent: SDKUserMessage = {
  type: 'user',
  uuid: 'msg_user_002',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'Read this file please' }],
  },
}

export const userToolResultContent: SDKUserMessage = {
  type: 'user',
  uuid: 'msg_user_003',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'Bash-DqG3e6jS',
        content: 'DIAGNOSTIC_TEST',
        is_error: false,
      },
    ],
  },
  parent_tool_use_id: null,
  session_id: 'session_abc',
  tool_use_result: {
    stdout: 'DIAGNOSTIC_TEST\r',
    stderr: '',
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
  },
}

export const userToolResultFileContent: SDKUserMessage = {
  type: 'user',
  uuid: 'msg_user_004',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'Read-lXcU7wnz',
        content: '     1→{"name": "my-project"}',
        is_error: false,
      },
    ],
  },
  parent_tool_use_id: null,
  session_id: 'session_abc',
  tool_use_result: {
    type: 'text',
    file: {
      filePath: '/project/package.json',
      content: '{"name": "my-project"}',
      numLines: 1,
      startLine: 1,
      totalLines: 1,
    },
  },
}

export const userToolResultError: SDKUserMessage = {
  type: 'user',
  uuid: 'msg_user_005',
  message: {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'Bash-fail01',
        content: 'command not found: foo',
        is_error: true,
      },
    ],
  },
  tool_use_result: {
    stdout: '',
    stderr: 'command not found: foo',
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
  },
}

// ── Result Messages ──

export const resultSuccess: SDKResultSuccess = {
  type: 'result',
  subtype: 'success',
  uuid: 'res_001',
  session_id: 'session_abc',
  usage: { input_tokens: 1000, output_tokens: 500 },
  is_error: false,
  result: 'Task completed successfully.',
  duration_ms: 5200,
  duration_api_ms: 4800,
  num_turns: 3,
  total_cost_usd: 0.012,
  stop_reason: 'end_turn',
  modelUsage: {},
  permission_denials: [],
}

export const resultError: SDKResultError = {
  type: 'result',
  subtype: 'error_during_execution',
  uuid: 'res_002',
  session_id: 'session_abc',
  errors: ['API rate limit exceeded'],
  is_error: true,
  duration_ms: 1200,
  duration_api_ms: 1000,
  num_turns: 1,
  total_cost_usd: 0.002,
  usage: { input_tokens: 200, output_tokens: 10 },
  modelUsage: {},
  permission_denials: [],
  stop_reason: null,
}

export const resultErrorMaxTurns: SDKResultError = {
  type: 'result',
  subtype: 'error_max_turns',
  uuid: 'res_003',
  session_id: 'session_abc',
  is_error: false,
  duration_ms: 14121,
  duration_api_ms: 13000,
  num_turns: 3,
  total_cost_usd: 0.018,
  usage: { input_tokens: 1186, output_tokens: 64 },
  errors: [],
  modelUsage: {},
  permission_denials: [],
  stop_reason: null,
}

// ── System Messages ──

export const systemInit: SDKSystemInit = {
  type: 'system',
  subtype: 'init',
  session_id: 'session_abc',
  uuid: 'init_uuid_001',
  model: 'claude-sonnet-4-20250514',
  tools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
  cwd: '/home/user/project',
  permissionMode: 'default',
  claude_code_version: '2.1.39',
  apiKeySource: 'ANTHROPIC_API_KEY',
  output_style: 'default',
  mcp_servers: [],
  slash_commands: ['compact', 'review'],
  agents: ['Bash', 'Explore'],
  skills: ['debug'],
  plugins: [],
  fast_mode_state: 'off',
}

export const systemStatus: SDKSystemStatus = {
  type: 'system',
  subtype: 'status',
  status: 'compacting',
}

export const systemCompactBoundary: SDKSystemCompactBoundary = {
  type: 'system',
  subtype: 'compact_boundary',
  compact_metadata: {
    trigger: 'auto',
    pre_tokens: 50000,
  },
}

export const systemCompactBoundaryWithMeta: SDKSystemCompactBoundary = {
  type: 'system',
  subtype: 'compact_boundary',
  compact_metadata: {
    trigger: 'manual',
    pre_tokens: 8500,
  },
}

export const systemHookStart: SDKSystemHookStarted = {
  type: 'system',
  subtype: 'hook_started',
  hook_id: 'hook_001',
  hook_name: 'prettier',
  hook_event: 'PostToolUse',
}

export const systemHookEnd: SDKSystemHookResponse = {
  type: 'system',
  subtype: 'hook_response',
  hook_id: 'hook_001',
  hook_name: 'prettier',
  hook_event: 'PostToolUse',
  output: 'Prettier completed',
  stdout: 'Prettier completed',
  stderr: '',
  outcome: 'success',
}

export const systemHookOutput: SDKSystemHookProgress = {
  type: 'system',
  subtype: 'hook_progress',
  hook_id: 'hook_002',
  hook_name: 'tsc',
  hook_event: 'PostToolUse',
  output: 'error TS2345: Argument of type...',
  stdout: 'error TS2345: Argument of type...',
  stderr: '',
}

// ── Stream Events（嵌套 event 结构） ──

export const streamEventTextDelta: SDKStreamEvent = {
  type: 'stream_event',
  uuid: 'stream_001',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'text_delta',
      text: 'partial text',
    },
  },
  session_id: 'session_abc',
  parent_tool_use_id: null,
}

export const streamEventThinkingDelta: SDKStreamEvent = {
  type: 'stream_event',
  uuid: 'stream_002',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'thinking_delta',
      thinking: 'let me think about this',
    },
  },
  session_id: 'session_abc',
}

export const streamEventMessageStart: SDKStreamEvent = {
  type: 'stream_event',
  uuid: 'stream_003',
  event: {
    type: 'message_start',
  },
  session_id: 'session_abc',
}

export const streamEventBlockStop: SDKStreamEvent = {
  type: 'stream_event',
  uuid: 'stream_004',
  event: {
    type: 'content_block_stop',
    index: 0,
  },
  session_id: 'session_abc',
}

// ── Tool Progress / Summary ──

export const toolProgress: SDKToolProgress = {
  type: 'tool_progress',
  uuid: 'prog_001',
  tool_name: 'Bash',
  tool_use_id: 'toolu_01XYZ',
  parent_tool_use_id: null,
  elapsed_time_seconds: 3.2,
  session_id: 'session_abc',
}

export const toolUseSummary: SDKToolUseSummary = {
  type: 'tool_use_summary',
  uuid: 'sum_001',
  summary: 'Read 45 lines from src/index.ts',
  preceding_tool_use_ids: ['toolu_01ABC'],
  session_id: 'session_abc',
}

export const toolUseSummaryError: SDKToolUseSummary = {
  type: 'tool_use_summary',
  uuid: 'sum_002',
  summary: 'Command failed with exit code 1',
  preceding_tool_use_ids: ['toolu_01GHI'],
  session_id: 'session_abc',
}

// ── Realistic conversation flow ──

export const realisticConversation = [
  systemInit,
  userStringContent,
  assistantWithThinking,
  assistantWithToolUse,
  toolProgress,
  toolUseSummary,
  assistantTextOnly,
  resultSuccess,
] as const
