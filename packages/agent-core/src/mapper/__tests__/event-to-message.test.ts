import { describe, it, expect, beforeEach } from 'vitest'
import { createEventToMessageMapper } from '../event-to-message.js'
import type { EventToMessageMapper } from '../event-to-message.js'
import type { AgentEvent } from '../../loop/types.js'

describe('EventToMessageMapper', () => {
  let mapper: EventToMessageMapper
  let idCounter: number

  beforeEach(() => {
    idCounter = 0
    mapper = createEventToMessageMapper({
      sessionId: 'test-session',
      idGenerator: () => `msg_${++idCounter}`,
    })
  })

  describe('text events', () => {
    it('text_start returns undefined', () => {
      const result = mapper.map({ type: 'text_start' })
      expect(result).toBeUndefined()
    })

    it('text_delta produces assistant text message with isStreamDelta', () => {
      mapper.map({ type: 'text_start' })
      const result = mapper.map({ type: 'text_delta', text: 'Hello' })

      expect(result).toBeDefined()
      expect(result!.role).toBe('assistant')
      expect(result!.type).toBe('text')
      expect(result!.content).toBe('Hello')
      expect(result!.isStreamDelta).toBe(true)
      expect(result!.sessionId).toBe('test-session')
    })

    it('text_delta accumulates content across deltas', () => {
      mapper.map({ type: 'text_start' })
      mapper.map({ type: 'text_delta', text: 'Hello ' })
      const result = mapper.map({ type: 'text_delta', text: 'world' })

      expect(result!.content).toBe('Hello world')
    })

    it('text_delta uses stable ID within same text block', () => {
      mapper.map({ type: 'text_start' })
      const r1 = mapper.map({ type: 'text_delta', text: 'a' })
      const r2 = mapper.map({ type: 'text_delta', text: 'b' })

      expect(r1!.id).toBe(r2!.id)
    })

    it('text_end produces final message without isStreamDelta', () => {
      mapper.map({ type: 'text_start' })
      mapper.map({ type: 'text_delta', text: 'Hello ' })
      mapper.map({ type: 'text_delta', text: 'world' })
      const result = mapper.map({ type: 'text_end', text: 'Hello world' })

      expect(result!.content).toBe('Hello world')
      expect(result!.isStreamDelta).toBeUndefined()
      expect(result!.role).toBe('assistant')
      expect(result!.type).toBe('text')
    })

    it('text_end uses same ID as deltas', () => {
      mapper.map({ type: 'text_start' })
      const delta = mapper.map({ type: 'text_delta', text: 'hi' })
      const end = mapper.map({ type: 'text_end', text: 'hi' })

      // text_start generates the ID (msg_1), delta reuses it, end reuses it
      expect(delta!.id).toBe('msg_1')
      expect(end!.id).toBe('msg_1')
    })
  })

  describe('thinking events', () => {
    it('thinking_start returns undefined', () => {
      const result = mapper.map({ type: 'thinking_start' })
      expect(result).toBeUndefined()
    })

    it('thinking_delta produces thinking message with isStreamDelta', () => {
      mapper.map({ type: 'thinking_start' })
      const result = mapper.map({ type: 'thinking_delta', text: 'Let me think...' })

      expect(result!.role).toBe('assistant')
      expect(result!.type).toBe('thinking')
      expect(result!.content).toBe('Let me think...')
      expect(result!.isStreamDelta).toBe(true)
    })

    it('thinking_delta accumulates content', () => {
      mapper.map({ type: 'thinking_start' })
      mapper.map({ type: 'thinking_delta', text: 'Step 1. ' })
      const result = mapper.map({ type: 'thinking_delta', text: 'Step 2.' })

      expect(result!.content).toBe('Step 1. Step 2.')
    })

    it('thinking_end produces final message', () => {
      mapper.map({ type: 'thinking_start' })
      mapper.map({ type: 'thinking_delta', text: 'Done' })
      const result = mapper.map({ type: 'thinking_end', text: 'Done' })

      expect(result!.type).toBe('thinking')
      expect(result!.content).toBe('Done')
      expect(result!.isStreamDelta).toBeUndefined()
    })
  })

  describe('tool events', () => {
    it('tool_call_start produces tool_use message', () => {
      const result = mapper.map({
        type: 'tool_call_start',
        toolCallId: 'tc_1',
        toolName: 'Read',
      })

      expect(result!.role).toBe('assistant')
      expect(result!.type).toBe('tool_use')
      expect(result!.toolName).toBe('Read')
      expect(result!.toolUseId).toBe('tc_1')
    })

    it('tool_call_args reuses the ID from tool_call_start', () => {
      const start = mapper.map({
        type: 'tool_call_start',
        toolCallId: 'tc_1',
        toolName: 'Read',
      })
      const args = mapper.map({
        type: 'tool_call_args',
        toolCallId: 'tc_1',
        args: { file_path: '/a.txt' },
      })

      expect(args!.id).toBe(start!.id)
      expect(args!.role).toBe('assistant')
      expect(args!.type).toBe('tool_use')
      expect(args!.toolUseId).toBe('tc_1')
      expect(args!.toolInput).toEqual({ file_path: '/a.txt' })
      expect(args!.isStreamDelta).toBe(true)
    })

    it('tool_call_args generates new ID when no prior start event', () => {
      const result = mapper.map({
        type: 'tool_call_args',
        toolCallId: 'tc_orphan',
        args: { cmd: 'ls' },
      })

      expect(result!.id).toBeDefined()
      expect(result!.toolInput).toEqual({ cmd: 'ls' })
    })

    it('tool_result produces tool role message', () => {
      const result = mapper.map({
        type: 'tool_result',
        toolCallId: 'tc_1',
        toolName: 'Read',
        result: 'file contents here',
        isError: false,
      })

      expect(result!.role).toBe('tool')
      expect(result!.type).toBe('tool_result')
      expect(result!.toolUseId).toBe('tc_1')
      expect(result!.toolName).toBe('Read')
      expect(result!.toolResult).toBe('file contents here')
      expect(result!.content).toBe('file contents here')
      expect(result!.success).toBe(true)
    })

    it('tool_result with error sets success to false', () => {
      const result = mapper.map({
        type: 'tool_result',
        toolCallId: 'tc_2',
        toolName: 'Bash',
        result: 'Command failed',
        isError: true,
      })

      expect(result!.success).toBe(false)
    })
  })

  describe('step and done events', () => {
    it('step_end produces usage message', () => {
      const result = mapper.map({
        type: 'step_end',
        step: 0,
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      expect(result!.role).toBe('system')
      expect(result!.type).toBe('usage')
      expect(result!.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
      })
    })

    it('step_end includes cache tokens when present', () => {
      const result = mapper.map({
        type: 'step_end',
        step: 0,
        finishReason: 'stop',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 80,
          cacheWriteTokens: 20,
        },
      })

      expect(result!.usage!.cacheReadTokens).toBe(80)
      expect(result!.usage!.cacheWriteTokens).toBe(20)
    })

    it('done returns undefined to avoid double-counting with step_end', () => {
      const result = mapper.map({
        type: 'done',
        totalUsage: {
          inputTokens: 200,
          outputTokens: 100,
          cacheReadTokens: 150,
          cacheWriteTokens: 50,
          reasoningTokens: 30,
          steps: 2,
        },
      })

      expect(result).toBeUndefined()
    })
  })

  describe('error events', () => {
    it('error produces system error message', () => {
      const result = mapper.map({
        type: 'error',
        error: 'Rate limit exceeded',
      })

      expect(result!.role).toBe('system')
      expect(result!.type).toBe('error')
      expect(result!.content).toBe('Rate limit exceeded')
    })
  })

  describe('reset', () => {
    it('resets text block tracking', () => {
      mapper.map({ type: 'text_start' })
      const r1 = mapper.map({ type: 'text_delta', text: 'a' })

      mapper.reset()

      mapper.map({ type: 'text_start' })
      const r2 = mapper.map({ type: 'text_delta', text: 'b' })

      // After reset, new text block gets new ID
      expect(r1!.id).not.toBe(r2!.id)
      // Content should not carry over
      expect(r2!.content).toBe('b')
    })

    it('resets thinking block tracking', () => {
      mapper.map({ type: 'thinking_start' })
      mapper.map({ type: 'thinking_delta', text: 'old' })

      mapper.reset()

      mapper.map({ type: 'thinking_start' })
      const result = mapper.map({ type: 'thinking_delta', text: 'new' })

      expect(result!.content).toBe('new')
    })
  })

  describe('full conversation flow', () => {
    it('maps a complete text-only exchange', () => {
      const events: AgentEvent[] = [
        { type: 'text_start' },
        { type: 'text_delta', text: 'Hello ' },
        { type: 'text_delta', text: 'world!' },
        { type: 'text_end', text: 'Hello world!' },
        { type: 'step_end', step: 0, finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } },
        { type: 'done', totalUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 1 } },
      ]

      const messages = events.map(e => mapper.map(e)).filter((m): m is NonNullable<typeof m> => m !== undefined)

      expect(messages).toHaveLength(4) // 2 deltas + 1 end + 1 step_end (done is suppressed)
      expect(messages[0]!.type).toBe('text')
      expect(messages[0]!.isStreamDelta).toBe(true)
      expect(messages[2]!.type).toBe('text')
      expect(messages[2]!.isStreamDelta).toBeUndefined()
      expect(messages[3]!.type).toBe('usage')
    })

    it('maps a tool call flow', () => {
      const events: AgentEvent[] = [
        { type: 'tool_call_start', toolCallId: 'tc_1', toolName: 'Read' },
        { type: 'tool_call_args', toolCallId: 'tc_1', args: { file_path: '/a.txt' } },
        { type: 'tool_result', toolCallId: 'tc_1', toolName: 'Read', result: 'contents', isError: false },
        { type: 'step_end', step: 0, finishReason: 'tool-calls', usage: { inputTokens: 10, outputTokens: 5 } },
        { type: 'text_start' },
        { type: 'text_delta', text: 'I read the file.' },
        { type: 'text_end', text: 'I read the file.' },
        { type: 'step_end', step: 1, finishReason: 'stop', usage: { inputTokens: 20, outputTokens: 10 } },
        { type: 'done', totalUsage: { inputTokens: 30, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 2 } },
      ]

      const messages = events.map(e => mapper.map(e)).filter((m): m is NonNullable<typeof m> => m !== undefined)

      const types = messages.map(m => m.type)
      expect(types).toEqual(['tool_use', 'tool_use', 'tool_result', 'usage', 'text', 'text', 'usage'])

      const toolUse = messages[0]!
      expect(toolUse.toolName).toBe('Read')
      expect(toolUse.toolUseId).toBe('tc_1')

      const toolResult = messages[2]!
      expect(toolResult.role).toBe('tool')
      expect(toolResult.success).toBe(true)
    })
  })
})
