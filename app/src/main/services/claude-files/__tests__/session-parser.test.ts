import { describe, it, expect } from 'vitest';
import {
  createSessionJsonlMapper,
  extractSessionMetadata,
  mapJsonlEntryToMessages,
} from '../session-parser';

describe('extractSessionMetadata', () => {
  const mockReadFile = (content: string) => async () => content;

  describe('sdkSessionId extraction', () => {
    it('should extract SDK session ID from system/init message', async () => {
      const jsonlContent = [
        '{"type": "session_meta", "name": "Test Session"}',
        '{"type": "system", "subtype": "init", "session_id": "sdk-session-abc-123", "model": "claude-sonnet-4"}',
        '{"type": "user", "content": "hello"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('sdk-session-abc-123');
    });

    it('should extract SDK session ID from session_runtime marker', async () => {
      const jsonlContent = [
        '{"type": "session_meta", "name": "Runtime Marker"}',
        '{"type": "session_runtime", "sdk_session_id": "sdk-runtime-001"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('sdk-runtime-001');
    });

    it('should extract SDK session ID even when system/init appears after user message', async () => {
      const jsonlContent = [
        '{"type": "session_meta", "name": "Late Init"}',
        '{"type": "user", "content": "first message"}',
        '{"type": "system", "subtype": "init", "session_id": "late-sdk-id-456"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('late-sdk-id-456');
    });

    it('should return undefined sdkSessionId when no system/init message exists', async () => {
      const jsonlContent = [
        '{"type": "session_meta", "name": "No Init"}',
        '{"type": "user", "content": "hello"}',
        '{"type": "assistant", "content": "hi there"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBeUndefined();
    });

    it('should only capture first system/init session_id', async () => {
      const jsonlContent = [
        '{"type": "system", "subtype": "init", "session_id": "first-sdk-id"}',
        '{"type": "system", "subtype": "init", "session_id": "second-sdk-id"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('first-sdk-id');
    });

    it('should handle system/init without session_id', async () => {
      const jsonlContent = [
        '{"type": "system", "subtype": "init", "model": "claude-sonnet-4"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBeUndefined();
    });

    it('should ignore system messages with other subtypes', async () => {
      const jsonlContent = [
        '{"type": "system", "subtype": "status", "message": "Connecting..."}',
        '{"type": "system", "subtype": "hook_start", "hook_name": "prettier"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBeUndefined();
    });

    it('should extract SDK session ID from native sessionId field', async () => {
      const jsonlContent = [
        '{"type":"user","sessionId":"native-sdk-123","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('native-sdk-123');
    });
  });

  describe('existing metadata extraction', () => {
    it('should extract name from session_meta', async () => {
      const jsonlContent = '{"type": "session_meta", "name": "Meta Name"}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.name).toBe('Meta Name');
    });

    it('should extract permissionMode from session_meta', async () => {
      const jsonlContent = '{"type": "session_meta", "permission_mode": "plan"}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.permissionMode).toBe('plan');
    });

    it('should extract runtime from session_meta', async () => {
      const jsonlContent = '{"type": "session_meta", "runtime": "codex"}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.runtime).toBe('codex');
    });

    it('should extract name from first user message', async () => {
      const jsonlContent = '{"type": "user", "content": "Help me with auth"}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.name).toBe('Help me with auth');
    });

    it('should truncate long user message to 50 characters', async () => {
      const longMessage = 'A'.repeat(100);
      const jsonlContent = `{"type": "user", "content": "${longMessage}"}`;

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.name).toBe('A'.repeat(50) + '...');
    });

    it('should extract name from prompt field', async () => {
      const jsonlContent = '{"prompt": "Extract from prompt"}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.name).toBe('Extract from prompt');
    });

    it('should extract name from native user message blocks', async () => {
      const jsonlContent = '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Native block title"}]}}';

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.name).toBe('Native block title');
    });
  });

  describe('combined extraction', () => {
    it('should extract all metadata including sdkSessionId', async () => {
      const jsonlContent = [
        '{"type": "session_meta", "name": "Full Session", "permission_mode": "acceptEdits", "runtime": "claude"}',
        '{"type": "system", "subtype": "init", "session_id": "combined-sdk-id", "model": "claude-opus-4"}',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata).toEqual({
        name: 'Full Session',
        permissionMode: 'acceptEdits',
        runtime: 'claude',
        sdkSessionId: 'combined-sdk-id',
      });
    });
  });

  describe('error handling', () => {
    it('should return empty object when file read fails', async () => {
      const failingReadFile = async () => {
        throw new Error('ENOENT');
      };

      const metadata = await extractSessionMetadata(failingReadFile, '/test/missing.jsonl');

      expect(metadata).toEqual({});
    });

    it('should skip malformed JSON lines', async () => {
      const jsonlContent = [
        'not valid json',
        '{"type": "system", "subtype": "init", "session_id": "valid-sdk-id"}',
        '{broken json',
      ].join('\n');

      const metadata = await extractSessionMetadata(mockReadFile(jsonlContent), '/test/session.jsonl');

      expect(metadata.sdkSessionId).toBe('valid-sdk-id');
    });

    it('should handle empty file', async () => {
      const metadata = await extractSessionMetadata(mockReadFile(''), '/test/empty.jsonl');

      expect(metadata).toEqual({});
    });

    it('should handle file with only empty lines', async () => {
      const metadata = await extractSessionMetadata(mockReadFile('\n\n\n'), '/test/blank.jsonl');

      expect(metadata).toEqual({});
    });
  });

  describe('native message mapping', () => {
    it('should fan out assistant native blocks', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'assistant',
          uuid: 'assistant-native',
          time: '2026-01-01T00:00:00.000Z',
          message: {
            id: 'assistant-native-id',
            content: [
              { type: 'thinking', thinking: 'plan first' },
              { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/a.ts' } },
              { type: 'text', text: 'done' },
            ],
            usage: {
              input_tokens: 11,
              output_tokens: 4,
            },
          },
        },
        'session-1',
      );

      expect(messages).toHaveLength(3);
      expect(messages[0].type).toBe('thinking');
      expect(messages[1].type).toBe('tool_use');
      expect(messages[2].type).toBe('text');
      expect(messages[2].usage?.inputTokens).toBe(11);
    });

    it('should map native user tool_result blocks', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'user',
          uuid: 'user-native',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_2',
                content: 'output',
                is_error: false,
              },
            ],
          },
        },
        'session-1',
      );

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].toolUseId).toBe('toolu_2');
      expect(messages[0].success).toBe(true);
    });

    it('should map native user text blocks for history replay', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'user',
          uuid: 'user-native-text',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'hello history' }],
          },
        },
        'session-1',
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        role: 'user',
        type: 'text',
        content: 'hello history',
      });
    });

    it('should map SDK system status events through shared parser', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'system',
          subtype: 'status',
          status: 'compacting',
        },
        'session-1',
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        role: 'system',
        type: 'text',
        content: 'Compacting conversation context...',
      });
    });

    it('should ignore stream_event deltas in history replay', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: 'partial',
            },
          },
        },
        'session-1',
      );

      expect(messages).toHaveLength(0);
    });

    it('should preserve line timestamp for sdk-native history rows', () => {
      const messages = mapJsonlEntryToMessages(
        {
          type: 'assistant',
          uuid: 'assistant-ts',
          timestamp: 1710000000000,
          message: {
            id: 'assistant-ts-id',
            content: [{ type: 'text', text: 'timestamped' }],
          },
        },
        'session-1',
      );

      expect(messages).toHaveLength(1);
      expect(messages[0].timestamp).toBe(1710000000000);
    });

    it('should carry parser context across lines when using session mapper', () => {
      const mapper = createSessionJsonlMapper('session-1');

      const toolUseMessages = mapper.mapEntry({
        type: 'assistant',
        uuid: 'assistant-ctx-1',
        timestamp: 1000,
        message: {
          id: 'assistant-ctx-msg',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_ctx_1',
              name: 'Read',
              input: { file_path: '/tmp/a.ts' },
            },
          ],
        },
      });

      const toolResultMessages = mapper.mapEntry({
        type: 'user',
        uuid: 'user-ctx-1',
        timestamp: 2000,
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_ctx_1',
              content: 'ok',
              is_error: false,
            },
          ],
        },
      });

      mapper.reset();

      expect(toolUseMessages).toHaveLength(1);
      expect(toolUseMessages[0]).toMatchObject({
        type: 'tool_use',
        toolName: 'Read',
      });
      expect(toolResultMessages).toHaveLength(1);
      expect(toolResultMessages[0]).toMatchObject({
        type: 'tool_result',
        toolUseId: 'toolu_ctx_1',
        toolName: 'Read',
        timestamp: 2000,
      });
    });
  });
});
