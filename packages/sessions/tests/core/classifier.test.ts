import { describe, it, expect } from 'vitest'
import { classifyEntry, isSystemMessage } from '../../src/core/classifier.js'
import type { RawJsonlEntry } from '../../src/core/types.js'

describe('classifyEntry', () => {
  it('skips session_meta entries', () => {
    const entry: RawJsonlEntry = { type: 'session_meta', session_id: 'test' }
    expect(classifyEntry(entry, 1)).toHaveLength(0)
  })

  it('skips queue-operation entries', () => {
    const entry: RawJsonlEntry = { type: 'queue-operation', operation: 'dequeue' }
    expect(classifyEntry(entry, 1)).toHaveLength(0)
  })

  it('classifies real user text message', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      uuid: 'test-uuid',
      parentUuid: null,
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:00.000Z',
      gitBranch: 'main',
      permissionMode: 'acceptEdits',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello, help me write code' }],
      },
    }
    const msgs = classifyEntry(entry, 1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.role).toBe('user')
    expect(msgs[0]!.type).toBe('text')
    expect(msgs[0]!.text).toBe('Hello, help me write code')
    expect(msgs[0]!.gitBranch).toBe('main')
  })

  it('classifies system-injected user message as system role', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      uuid: 'sys-uuid',
      parentUuid: null,
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '<system-reminder>Remember to be helpful</system-reminder>' }],
      },
    }
    const msgs = classifyEntry(entry, 1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.role).toBe('system')
  })

  it('classifies tool_result in user message', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      uuid: 'user-uuid',
      parentUuid: 'asst-uuid',
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:00.000Z',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-001',
          content: 'File written',
        }],
      },
    }
    const msgs = classifyEntry(entry, 3)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.type).toBe('tool_result')
    expect(msgs[0]!.role).toBe('tool')
    expect(msgs[0]!.toolUseId).toBe('tool-001')
    expect(msgs[0]!.toolResultContent).toBe('File written')
  })

  it('classifies assistant message with tool_use', () => {
    const entry: RawJsonlEntry = {
      type: 'assistant',
      uuid: 'asst-uuid',
      parentUuid: 'user-uuid',
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:05.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me write that file.' },
          {
            type: 'tool_use',
            id: 'tool-001',
            name: 'Write',
            input: { file_path: '/test/hello.ts', content: 'hello' },
          },
        ],
        id: 'req-001',
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }
    const msgs = classifyEntry(entry, 2)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.type).toBe('text')
    expect(msgs[0]!.role).toBe('assistant')
    expect(msgs[1]!.type).toBe('tool_use')
    expect(msgs[1]!.toolName).toBe('Write')
    expect(msgs[1]!.toolUseId).toBe('tool-001')
    // Usage attached to last message
    expect(msgs[1]!.usage?.inputTokens).toBe(100)
    expect(msgs[1]!.usage?.outputTokens).toBe(50)
  })

  it('classifies assistant thinking block', () => {
    const entry: RawJsonlEntry = {
      type: 'assistant',
      uuid: 'think-uuid',
      parentUuid: null,
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me think...' }],
        id: 'req-001',
        model: 'claude-opus-4-6',
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }
    const msgs = classifyEntry(entry, 1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.type).toBe('thinking')
    expect(msgs[0]!.text).toBe('Let me think...')
  })

  it('classifies file-history-snapshot', () => {
    const entry: RawJsonlEntry = {
      type: 'file-history-snapshot',
      uuid: 'snap-001',
      parentUuid: null,
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:12.000Z',
      snapshot: {
        messageId: 'msg-001',
        trackedFileBackups: {
          'src/hello.ts': {
            backupFileName: 'abc123@v1',
            version: 1,
            backupTime: '2025-01-01T10:00:06.000Z',
          },
        },
        timestamp: '2025-01-01T10:00:12.000Z',
      },
    }
    const msgs = classifyEntry(entry, 7)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.type).toBe('file_snapshot')
    expect(msgs[0]!.fileSnapshot?.files).toHaveLength(1)
    expect(msgs[0]!.fileSnapshot?.files[0]!.filePath).toBe('src/hello.ts')
    expect(msgs[0]!.fileSnapshot?.files[0]!.backupFileName).toBe('abc123@v1')
  })

  it('classifies progress message', () => {
    const entry: RawJsonlEntry = {
      type: 'progress',
      uuid: 'prog-001',
      parentUuid: 'asst-001',
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:07.000Z',
      data: { type: 'bash_progress', output: 'running...', fullOutput: 'running...' },
    }
    const msgs = classifyEntry(entry, 5)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.type).toBe('progress')
    expect(msgs[0]!.progressType).toBe('bash_progress')
  })

  it('classifies summary message', () => {
    const entry: RawJsonlEntry = {
      type: 'summary',
      uuid: 'sum-001',
      parentUuid: null,
      isSidechain: false,
      sessionId: 'sess-001',
      timestamp: '2025-01-01T10:00:15.000Z',
      summary: 'Implemented hello function',
    }
    const msgs = classifyEntry(entry, 10)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.type).toBe('summary')
    expect(msgs[0]!.text).toBe('Implemented hello function')
  })
})

describe('isSystemMessage', () => {
  it('detects system-reminder prefix', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '<system-reminder>test</system-reminder>' }],
      },
    }
    expect(isSystemMessage(entry)).toBe(true)
  })

  it('detects command-name prefix', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '<command-name>commit</command-name>' }],
      },
    }
    expect(isSystemMessage(entry)).toBe(true)
  })

  it('allows normal user messages', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Please help me fix this bug' }],
      },
    }
    expect(isSystemMessage(entry)).toBe(false)
  })

  it('detects Warmup exact match', () => {
    const entry: RawJsonlEntry = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Warmup' }],
      },
    }
    expect(isSystemMessage(entry)).toBe(true)
  })
})
