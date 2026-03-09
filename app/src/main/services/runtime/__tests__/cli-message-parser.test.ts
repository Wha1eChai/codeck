import { describe, it, expect } from 'vitest'
import { parseCliMessage } from '../cli-message-parser'

const SESSION_ID = 'test-session-123'

describe('parseCliMessage', () => {
  it('returns null for invalid JSON', () => {
    expect(parseCliMessage('not json', SESSION_ID)).toBeNull()
  })

  it('returns null for JSON without type field', () => {
    expect(parseCliMessage('{"foo":"bar"}', SESSION_ID)).toBeNull()
  })

  it('returns null for unknown message type', () => {
    expect(parseCliMessage('{"type":"unknown_type"}', SESSION_ID)).toBeNull()
  })

  describe('assistant messages', () => {
    it('parses text content block', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }] },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        sessionId: SESSION_ID,
        role: 'assistant',
        type: 'text',
        content: 'Hello world',
      })
    })

    it('parses thinking content block', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: 'Let me think...' }] },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        type: 'thinking',
        content: 'Let me think...',
      })
    })

    it('parses tool_use content block', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool_123',
            name: 'Read',
            input: { file_path: '/tmp/test.ts' },
          }],
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/test.ts' },
        toolUseId: 'tool_123',
      })
    })

    it('parses tool_result content block', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool_123',
            content: 'file contents here',
          }],
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'tool_123',
        toolResult: 'file contents here',
        success: true,
      })
    })

    it('parses error tool_result', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tool_456',
            content: 'Permission denied',
            is_error: true,
          }],
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages[0]).toMatchObject({
        success: false,
      })
    })

    it('fans out multiple content blocks into multiple messages', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'Analyzing...' },
            { type: 'text', text: 'Here is the result' },
            { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(3)
      expect(result.messages[0]!.type).toBe('thinking')
      expect(result.messages[1]!.type).toBe('text')
      expect(result.messages[2]!.type).toBe('tool_use')
    })

    it('skips empty text blocks', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '' }] },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(0)
    })

    it('extracts session_id metadata from assistant message', () => {
      const raw = JSON.stringify({
        type: 'assistant',
        session_id: 'sdk_sess_abc',
        message: { content: [{ type: 'text', text: 'Hi' }] },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.metadata?.sessionId).toBe('sdk_sess_abc')
    })
  })

  describe('user messages', () => {
    it('parses string content', () => {
      const raw = JSON.stringify({
        type: 'user',
        message: { content: 'Hello Claude' },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({
        role: 'user',
        type: 'text',
        content: 'Hello Claude',
      })
    })

    it('parses array content (text blocks)', () => {
      const raw = JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' },
          ],
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]!.content).toBe('Line 1\nLine 2')
    })

    it('returns empty messages for empty content', () => {
      const raw = JSON.stringify({
        type: 'user',
        message: { content: '' },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(0)
    })
  })

  describe('result messages', () => {
    it('parses success result with usage', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'success',
        cost_usd: 0.05,
        duration_ms: 3200,
        session_id: 'sess_xyz',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
        },
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.isDone).toBe(true)
      expect(result.metadata?.sessionId).toBe('sess_xyz')
      expect(result.metadata?.costUsd).toBe(0.05)

      // Should have usage message
      const usageMsg = result.messages.find(m => m.type === 'usage')
      expect(usageMsg).toBeDefined()
      expect(usageMsg!.usage).toMatchObject({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        costUsd: 0.05,
      })
    })

    it('parses result with text result', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'Final answer text',
        session_id: 'sess_xyz',
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      const textMsg = result.messages.find(m => m.type === 'text')
      expect(textMsg).toBeDefined()
      expect(textMsg!.content).toBe('Final answer text')
    })

    it('parses error result', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        result: 'Max turns exceeded',
        session_id: 'sess_xyz',
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      const errorMsg = result.messages.find(m => m.type === 'error')
      expect(errorMsg).toBeDefined()
      expect(errorMsg!.content).toBe('Max turns exceeded')
    })

    it('detects error from subtype when is_error is missing', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'error_api',
        result: 'API error occurred',
        session_id: 'sess_xyz',
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      const errorMsg = result.messages.find(m => m.type === 'error')
      expect(errorMsg).toBeDefined()
    })

    it('uses total_cost_usd over cost_usd in metadata', () => {
      const raw = JSON.stringify({
        type: 'result',
        subtype: 'success',
        cost_usd: 0.01,
        total_cost_usd: 0.15,
        session_id: 'sess_xyz',
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.metadata?.costUsd).toBe(0.15)
    })
  })

  describe('system messages', () => {
    it('parses system init message', () => {
      const raw = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'sess_abc',
        tools: ['Read', 'Write', 'Bash'],
        mcp_servers: ['filesystem'],
      })
      const result = parseCliMessage(raw, SESSION_ID)!
      expect(result.messages).toHaveLength(0)
      expect(result.metadata?.sessionId).toBe('sess_abc')
    })
  })

  describe('real-world JSON-lines', () => {
    it('parses a typical assistant + result sequence', () => {
      const lines = [
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello! How can I help you?"}]},"session_id":"sess_123"}',
        '{"type":"result","subtype":"success","cost_usd":0.01,"usage":{"input_tokens":200,"output_tokens":50},"session_id":"sess_123"}',
      ]

      const results = lines.map(line => parseCliMessage(line, SESSION_ID))
      expect(results[0]!.messages).toHaveLength(1)
      expect(results[0]!.messages[0]!.content).toBe('Hello! How can I help you?')
      expect(results[1]!.isDone).toBe(true)
    })
  })
})
