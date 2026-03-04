import { describe, it, expect, vi } from 'vitest'
import { createSDKMessageParser, parseSDKMessage } from '../message-parser'
import {
  assistantTextOnly,
  assistantWithThinking,
  assistantWithToolUse,
  assistantMultiBlock,
  assistantEmptyContent,
  assistantWithUnknownBlock,
  userStringContent,
  userBlockContent,
  userToolResultContent,
  userToolResultFileContent,
  userToolResultError,
  resultSuccess,
  resultError,
  resultErrorMaxTurns,
  systemInit,
  systemStatus,
  systemCompactBoundary,
  systemCompactBoundaryWithMeta,
  systemHookStart,
  systemHookOutput,
  streamEventTextDelta,
  streamEventThinkingDelta,
  streamEventMessageStart,
  streamEventBlockStop,
  toolProgress,
  toolUseSummary,
  toolUseSummaryError,
} from './fixtures'

const SESSION_ID = 'test-session'

describe('parseSDKMessage', () => {
  describe('assistant messages', () => {
    it('should parse text-only assistant message', () => {
      const result = parseSDKMessage(assistantTextOnly, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        id: 'msg_text_001_block_0',
        role: 'assistant',
        type: 'text',
        content: 'Hello, I can help with that.',
      })
      // Usage attached to last message
      expect(result.messages[0].usage).toEqual({
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      })
    })

    it('should fan-out thinking + text blocks', () => {
      const result = parseSDKMessage(assistantWithThinking, SESSION_ID)

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0]).toMatchObject({
        type: 'thinking',
        content: 'I need to analyze the file structure first.',
      })
      expect(result.messages[1]).toMatchObject({
        type: 'text',
        content: 'Hello, I can help with that.',
      })
      // Usage only on last message
      expect(result.messages[0].usage).toBeUndefined()
      expect(result.messages[1].usage).toBeDefined()
    })

    it('should fan-out thinking + tool_use blocks', () => {
      const result = parseSDKMessage(assistantWithToolUse, SESSION_ID)

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].type).toBe('thinking')
      expect(result.messages[1]).toMatchObject({
        type: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/src/index.ts' },
        toolUseId: 'toolu_01ABC',
      })
    })

    it('should fan-out multiple blocks with usage on last', () => {
      const result = parseSDKMessage(assistantMultiBlock, SESSION_ID)

      expect(result.messages).toHaveLength(3)
      expect(result.messages[0].type).toBe('thinking')
      expect(result.messages[1].type).toBe('text')
      expect(result.messages[2].type).toBe('tool_use')
      expect(result.messages[2].usage).toEqual({
        inputTokens: 500,
        outputTokens: 100,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
      })
    })

    it('should return empty for empty content array', () => {
      const result = parseSDKMessage(assistantEmptyContent, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should handle unknown block types gracefully', () => {
      const result = parseSDKMessage(assistantWithUnknownBlock, SESSION_ID)

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].type).toBe('text')
      expect(result.messages[1].content).toBe('[Unknown content block: some_future_block]')
    })

    it('should propagate parent_tool_use_id from assistant messages', () => {
      const msg = {
        type: 'assistant',
        uuid: 'sub-uuid-1',
        parent_tool_use_id: 'parent-toolu-123',
        message: { role: 'assistant', content: [{ type: 'text', text: 'sub-agent response' }] },
      }
      const result = parseSDKMessage(msg, SESSION_ID)
      expect(result.messages[0].parentToolUseId).toBe('parent-toolu-123')
    })

    it('should not set parentToolUseId for top-level messages', () => {
      const msg = {
        type: 'assistant',
        uuid: 'top-uuid',
        parent_tool_use_id: null,
        message: { role: 'assistant', content: [{ type: 'text', text: 'top-level' }] },
      }
      const result = parseSDKMessage(msg, SESSION_ID)
      expect(result.messages[0].parentToolUseId).toBeUndefined()
    })
  })

  describe('user messages', () => {
    it('should skip user message with string content (optimistic render)', () => {
      const result = parseSDKMessage(userStringContent, SESSION_ID)

      expect(result.messages).toHaveLength(0)
    })

    it('should skip user message with block array content (optimistic render)', () => {
      const result = parseSDKMessage(userBlockContent, SESSION_ID)

      expect(result.messages).toHaveLength(0)
    })

    it('should include user string content in history mode', () => {
      const result = parseSDKMessage(userStringContent, SESSION_ID, { includeUserMessages: true })

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'user',
        type: 'text',
        content: 'Please read the file src/index.ts',
      })
    })

    it('should include user block text content in history mode', () => {
      const result = parseSDKMessage(userBlockContent, SESSION_ID, { includeUserMessages: true })

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'user',
        type: 'text',
        content: 'Read this file please',
      })
    })

    it('should parse user tool_result with stdout', () => {
      const result = parseSDKMessage(userToolResultContent, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'Bash-DqG3e6jS',
        success: true,
      })
      expect(result.messages[0].content).toContain('DIAGNOSTIC_TEST')
    })

    it('should parse user tool_result with file content', () => {
      const result = parseSDKMessage(userToolResultFileContent, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'Read-lXcU7wnz',
        success: true,
      })
      expect(result.messages[0].content).toBe('{"name": "my-project"}')
    })

    it('should parse user tool_result with error', () => {
      const result = parseSDKMessage(userToolResultError, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'Bash-fail01',
        success: false,
      })
    })
  })

  describe('result messages', () => {
    it('should parse success result with usage and cost', () => {
      const result = parseSDKMessage(resultSuccess, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'usage',
        content: '',
      })
      expect(result.messages[0].usage).toEqual({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        costUsd: 0.012,
        numTurns: 3,
        durationMs: 5200,
      })
    })

    it('should parse error result', () => {
      const result = parseSDKMessage(resultError, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'error',
        content: 'API rate limit exceeded',
      })
    })

    it('should parse error_max_turns with fallback message', () => {
      const result = parseSDKMessage(resultErrorMaxTurns, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'error',
        content: 'Maximum conversation turns reached.',
      })
    })
  })

  describe('system messages', () => {
    it('should extract metadata from init', () => {
      const result = parseSDKMessage(systemInit, SESSION_ID)

      expect(result.messages).toHaveLength(0)
      expect(result.metadata).toEqual({
        sessionId: 'session_abc',
        model: 'claude-sonnet-4-20250514',
        tools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
        cwd: '/home/user/project',
        permissionMode: 'default',
        claudeCodeVersion: '2.1.39',
        apiKeySource: 'ANTHROPIC_API_KEY',
        mcpServers: [],
        slashCommands: ['compact', 'review'],
        agents: ['Bash', 'Explore'],
        skills: ['debug'],
        fastModeState: 'off',
      })
    })

    it('should parse status message', () => {
      const result = parseSDKMessage(systemStatus, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'text',
        content: 'Compacting conversation context...',
      })
    })

    it('should emit compact message for compact_boundary', () => {
      const result = parseSDKMessage(systemCompactBoundary, SESSION_ID)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'compact',
      })
      expect(result.messages[0].content).toContain('compacted')
    })

    it('should include token savings in compact_boundary with metadata', () => {
      const result = parseSDKMessage(systemCompactBoundaryWithMeta, SESSION_ID)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].type).toBe('compact')
      expect(result.messages[0].content).toContain('8,500')
      expect(result.messages[0].content).toContain('manual')
    })

    it('should parse hook messages', () => {
      const result = parseSDKMessage(systemHookStart, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'text',
        content: '[Hook: prettier] Started',
      })
    })

    it('should parse hook output', () => {
      const result = parseSDKMessage(systemHookOutput, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toContain('[Hook: tsc]')
      expect(result.messages[0].content).toContain('error TS2345')
    })
  })

  describe('stream events', () => {
    it('should parse stream event with text delta', () => {
      const result = parseSDKMessage(streamEventTextDelta, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        type: 'text',
        content: 'partial text',
        isStreamDelta: true,
      })
    })

    it('should parse stream event with thinking delta', () => {
      const result = parseSDKMessage(streamEventThinkingDelta, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        type: 'thinking',
        content: 'let me think about this',
        isStreamDelta: true,
      })
    })

    it('should skip non-delta stream events (message_start)', () => {
      const result = parseSDKMessage(streamEventMessageStart, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should skip non-delta stream events (content_block_stop)', () => {
      const result = parseSDKMessage(streamEventBlockStop, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should skip stream events without event object', () => {
      const result = parseSDKMessage(
        { type: 'stream_event', uuid: 's1' },
        SESSION_ID,
      )
      expect(result.messages).toHaveLength(0)
    })

    it('should skip stream events in history mode', () => {
      const result = parseSDKMessage(streamEventTextDelta, SESSION_ID, { includeStreamEvents: false })
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('stateful stream parser', () => {
    it('falls back to stateless parsing when message_start is missing', () => {
      const parser = createSDKMessageParser()
      const result = parser.parse(streamEventTextDelta, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        type: 'text',
        content: 'partial text',
        isStreamDelta: true,
      })
    })

    it('builds stable block ids from stream_event and skips assistant echo', () => {
      const parser = createSDKMessageParser()

      const start = parser.parse(
        {
          type: 'stream_event',
          uuid: 'ev-1',
          event: {
            type: 'message_start',
            message: { id: 'stream-msg-1' },
          },
        },
        SESSION_ID,
      )
      expect(start.messages).toHaveLength(0)

      parser.parse(
        {
          type: 'stream_event',
          uuid: 'ev-2',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        SESSION_ID,
      )

      const delta1 = parser.parse(
        {
          type: 'stream_event',
          uuid: 'ev-3',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hel' },
          },
        },
        SESSION_ID,
      )
      expect(delta1.messages).toHaveLength(1)
      expect(delta1.messages[0]).toMatchObject({
        id: 'stream-msg-1_block_0',
        type: 'text',
        content: 'Hel',
        isStreamDelta: true,
      })

      const delta2 = parser.parse(
        {
          type: 'stream_event',
          uuid: 'ev-4',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'lo' },
          },
        },
        SESSION_ID,
      )
      expect(delta2.messages).toHaveLength(1)
      expect(delta2.messages[0]).toMatchObject({
        id: 'stream-msg-1_block_0',
        content: 'Hello',
        isStreamDelta: true,
      })

      const stop = parser.parse(
        {
          type: 'stream_event',
          uuid: 'ev-5',
          event: {
            type: 'content_block_stop',
            index: 0,
          },
        },
        SESSION_ID,
      )
      expect(stop.messages).toHaveLength(1)
      expect(stop.messages[0]).toMatchObject({
        id: 'stream-msg-1_block_0',
        content: 'Hello',
        isStreamDelta: false,
      })

      const assistantEcho = parser.parse(
        {
          type: 'assistant',
          uuid: 'assistant-1',
          message: {
            id: 'stream-msg-1',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
        SESSION_ID,
      )
      expect(assistantEcho.messages).toHaveLength(0)
    })

    it('tracks multi-block stream messages by block index', () => {
      const parser = createSDKMessageParser()
      const outputs = [] as string[]

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'message_start',
            message: { id: 'stream-msg-2' },
          },
        },
        SESSION_ID,
      )

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '' },
          },
        },
        SESSION_ID,
      )
      const thinkDelta = parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'step one' },
          },
        },
        SESSION_ID,
      )
      outputs.push(thinkDelta.messages[0].id)

      const thinkStop = parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_stop',
            index: 0,
          },
        },
        SESSION_ID,
      )
      outputs.push(thinkStop.messages[0].id)

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'text', text: '' },
          },
        },
        SESSION_ID,
      )
      const textDelta = parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'done' },
          },
        },
        SESSION_ID,
      )
      outputs.push(textDelta.messages[0].id)

      expect(outputs).toEqual([
        'stream-msg-2_block_0',
        'stream-msg-2_block_0',
        'stream-msg-2_block_1',
      ])
    })

    it('assembles tool_use input from input_json_delta on block stop', () => {
      const parser = createSDKMessageParser()

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'message_start',
            message: { id: 'stream-msg-3' },
          },
        },
        SESSION_ID,
      )

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'toolu_01', name: 'Read', input: {} },
          },
        },
        SESSION_ID,
      )

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{\"file_path\":\"src/index.ts\",\"offset\":',
            },
          },
        },
        SESSION_ID,
      )

      parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '1}',
            },
          },
        },
        SESSION_ID,
      )

      const stop = parser.parse(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_stop',
            index: 0,
          },
        },
        SESSION_ID,
      )

      expect(stop.messages).toHaveLength(1)
      expect(stop.messages[0]).toMatchObject({
        id: 'stream-msg-3_block_0',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_01',
        toolInput: { file_path: 'src/index.ts', offset: 1 },
        isStreamDelta: false,
      })
    })

    it('enriches user tool_result with toolName from prior tool_use by toolUseId', () => {
      const parser = createSDKMessageParser()

      parser.parse(
        {
          type: 'assistant',
          uuid: 'assistant-tool-1',
          message: {
            id: 'assistant-tool-1',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_lookup_1',
                name: 'Read',
                input: { file_path: 'src/app.ts' },
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
        SESSION_ID,
      )

      const result = parser.parse(
        {
          type: 'user',
          uuid: 'user-tool-result-1',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_lookup_1',
                content: 'file content',
                is_error: false,
              },
            ],
          },
        },
        SESSION_ID,
      )

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'toolu_lookup_1',
        toolName: 'Read',
        success: true,
      })
    })
  })

  describe('tool progress and summary', () => {
    it('should parse tool_progress', () => {
      const result = parseSDKMessage(toolProgress, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Bash',
        toolUseId: 'toolu_01XYZ',
        content: 'Running... 3.2s',
      })
    })

    it('should parse tool_use_summary', () => {
      const result = parseSDKMessage(toolUseSummary, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'text',
        content: 'Read 45 lines from src/index.ts',
      })
    })

    it('should parse tool_use_summary error text', () => {
      const result = parseSDKMessage(toolUseSummaryError, SESSION_ID)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'system',
        type: 'text',
        content: 'Command failed with exit code 1',
      })
    })
  })

  describe('edge cases', () => {
    it('should return empty for null input', () => {
      const result = parseSDKMessage(null, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should return empty for undefined input', () => {
      const result = parseSDKMessage(undefined, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should return empty for non-object input', () => {
      const result = parseSDKMessage('string', SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should return empty for auth_status', () => {
      const result = parseSDKMessage({ type: 'auth_status', status: 'ok' }, SESSION_ID)
      expect(result.messages).toHaveLength(0)
    })

    it('should return empty for unknown type with console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

      const result = parseSDKMessage({ type: 'future_type' }, SESSION_ID)

      expect(result.messages).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(
        '[sdk-parser]',
        'Unknown SDK message type: future_type',
      )

      warnSpy.mockRestore()
    })
  })
})
