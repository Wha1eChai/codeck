import { describe, expect, it } from 'vitest';
import { reconstructCoreMessages } from '../transcript-to-core-messages';
import type { Message } from '@common/types';

describe('reconstructCoreMessages', () => {
  it('compacts repeated stream snapshots and preserves final assistant content', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        sessionId: 'session-1',
        role: 'user',
        type: 'text',
        content: 'hello',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'text',
        content: 'hel',
        timestamp: 2,
      },
      {
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'text',
        content: 'hello there',
        timestamp: 3,
      },
    ];

    expect(reconstructCoreMessages(messages)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello there' }] },
    ]);
  });

  it('rebuilds assistant tool calls and tool results into resumable core messages', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        sessionId: 'session-1',
        role: 'user',
        type: 'text',
        content: 'read package.json',
        timestamp: 1,
      },
      {
        id: 'tool-use-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'tool_use',
        content: '',
        timestamp: 2,
        toolUseId: 'call-1',
        toolName: 'Read',
      },
      {
        id: 'tool-use-1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'tool_use',
        content: '',
        timestamp: 3,
        toolUseId: 'call-1',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/package.json' },
      },
      {
        id: 'tool-result-1',
        sessionId: 'session-1',
        role: 'tool',
        type: 'tool_result',
        content: '{"name":"codeck"}',
        timestamp: 4,
        toolUseId: 'call-1',
        toolName: 'Read',
        toolResult: '{"name":"codeck"}',
        success: true,
      },
    ];

    expect(reconstructCoreMessages(messages)).toEqual([
      { role: 'user', content: 'read package.json' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'Read',
            args: { file_path: '/tmp/package.json' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'Read',
            result: '{"name":"codeck"}',
          },
        ],
      },
    ]);
  });
});
