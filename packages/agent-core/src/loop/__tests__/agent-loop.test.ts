import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEvent } from '../types.js'
import type { ToolContext } from '../../tools/types.js'
import { createToolRegistry } from '../../tools/registry.js'
import { createDoomDetector } from '../doom-detector.js'
import { z } from 'zod'

// We test the doom detector directly and the event flow logic.
// The full agent loop requires mocking streamText which is complex,
// so we focus on unit-testable components + integration patterns.

describe('DoomDetector', () => {
  it('should detect repeated identical tool calls', () => {
    const detector = createDoomDetector(3)
    expect(detector.record('Read', { file_path: '/a.txt' })).toBe(false)
    expect(detector.record('Read', { file_path: '/a.txt' })).toBe(false)
    expect(detector.record('Read', { file_path: '/a.txt' })).toBe(true) // 3rd time
  })

  it('should reset count on different tool call', () => {
    const detector = createDoomDetector(3)
    detector.record('Read', { file_path: '/a.txt' })
    detector.record('Read', { file_path: '/a.txt' })
    detector.record('Write', { file_path: '/b.txt', content: '' }) // different
    expect(detector.record('Read', { file_path: '/a.txt' })).toBe(false) // reset
  })

  it('should reset count on same tool different args', () => {
    const detector = createDoomDetector(3)
    detector.record('Read', { file_path: '/a.txt' })
    detector.record('Read', { file_path: '/a.txt' })
    detector.record('Read', { file_path: '/b.txt' }) // different args
    expect(detector.record('Read', { file_path: '/a.txt' })).toBe(false)
  })

  it('should support custom threshold', () => {
    const detector = createDoomDetector(2)
    expect(detector.record('Bash', { command: 'echo hi' })).toBe(false)
    expect(detector.record('Bash', { command: 'echo hi' })).toBe(true)
  })

  it('should reset via reset()', () => {
    const detector = createDoomDetector(2)
    detector.record('Bash', { command: 'echo hi' })
    detector.reset()
    expect(detector.record('Bash', { command: 'echo hi' })).toBe(false)
  })
})

describe('ToolRegistry.toAISDKTools', () => {
  it('should convert tools to AI SDK format', () => {
    const registry = createToolRegistry()
    const params = z.object({ message: z.string() })
    registry.register({
      name: 'Echo',
      description: 'Echo a message',
      parameters: params,
      execute: async (p: { message: string }) => ({ output: p.message }),
    })

    const ctx: ToolContext = {
      sessionId: 'test',
      cwd: '/tmp',
      abortSignal: new AbortController().signal,
    }

    const sdkTools = registry.toAISDKTools(ctx)
    expect(sdkTools).toHaveProperty('Echo')
  })
})

describe('AgentLoop event collection helper', () => {
  // Helper to collect events from an async generator
  async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = []
    for await (const event of gen) {
      events.push(event)
    }
    return events
  }

  it('collectEvents works with simple generator', async () => {
    async function* fakeLoop(): AsyncGenerator<AgentEvent> {
      yield { type: 'text_start' }
      yield { type: 'text_delta', text: 'Hello' }
      yield { type: 'text_end', text: 'Hello' }
      yield { type: 'step_end', step: 0, finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'done', totalUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 1 } }
    }

    const events = await collectEvents(fakeLoop())
    expect(events).toHaveLength(5)
    expect(events[0]!.type).toBe('text_start')
    expect(events[4]!.type).toBe('done')
    const done = events[4] as Extract<AgentEvent, { type: 'done' }>
    expect(done.totalUsage.steps).toBe(1)
  })
})

describe('startAgentLoop with mock streamText', () => {
  // Mock the 'ai' module's streamText to test the loop without real API calls
  vi.mock('ai', () => {
    return {
      streamText: vi.fn(),
      tool: vi.fn((def: unknown) => def),
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle a pure text response', async () => {
    const { streamText: mockStreamText } = await import('ai')
    const mockedStreamText = vi.mocked(mockStreamText)

    // Create a mock fullStream that yields text events then finish
    async function* mockFullStream() {
      yield { type: 'text-delta' as const, textDelta: 'Hello ' }
      yield { type: 'text-delta' as const, textDelta: 'world' }
      yield {
        type: 'finish' as const,
        finishReason: 'stop' as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    }

    mockedStreamText.mockReturnValue({
      fullStream: mockFullStream(),
    } as unknown as ReturnType<typeof mockStreamText>)

    const { startAgentLoop } = await import('../agent-loop.js')
    const registry = createToolRegistry()
    const ctx: ToolContext = { sessionId: 'test', cwd: '/tmp', abortSignal: new AbortController().signal }

    const events: AgentEvent[] = []
    for await (const event of startAgentLoop('Hello', {
      model: {} as Parameters<typeof startAgentLoop>[1]['model'],
      systemPrompt: 'You are helpful',
      tools: registry,
      toolContext: ctx,
    })) {
      events.push(event)
    }

    const types = events.map(e => e.type)
    expect(types).toContain('text_start')
    expect(types).toContain('text_delta')
    expect(types).toContain('text_end')
    expect(types).toContain('step_end')
    expect(types).toContain('done')

    const textEnd = events.find(e => e.type === 'text_end') as Extract<AgentEvent, { type: 'text_end' }>
    expect(textEnd.text).toBe('Hello world')
  })

  it('should handle tool call and result', async () => {
    const { streamText: mockStreamText } = await import('ai')
    const mockedStreamText = vi.mocked(mockStreamText)

    // First call: tool-call + finish
    async function* mockFullStream1() {
      yield {
        type: 'tool-call' as const,
        toolCallId: 'tc_1',
        toolName: 'Echo',
        args: { message: 'hi' },
      }
      yield {
        type: 'finish' as const,
        finishReason: 'tool-calls' as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    }

    // Second call: text response
    async function* mockFullStream2() {
      yield { type: 'text-delta' as const, textDelta: 'Done!' }
      yield {
        type: 'finish' as const,
        finishReason: 'stop' as const,
        usage: { inputTokens: 15, outputTokens: 3 },
      }
    }

    let callCount = 0
    mockedStreamText.mockImplementation(() => {
      callCount++
      return {
        fullStream: callCount === 1 ? mockFullStream1() : mockFullStream2(),
      } as unknown as ReturnType<typeof mockStreamText>
    })

    const registry = createToolRegistry()
    registry.register({
      name: 'Echo',
      description: 'Echo',
      parameters: z.object({ message: z.string() }),
      execute: async (params: { message: string }) => ({ output: `echo: ${params.message}` }),
    })
    const ctx: ToolContext = { sessionId: 'test', cwd: '/tmp', abortSignal: new AbortController().signal }

    const { startAgentLoop } = await import('../agent-loop.js')

    const events: AgentEvent[] = []
    for await (const event of startAgentLoop('Use echo', {
      model: {} as Parameters<typeof startAgentLoop>[1]['model'],
      systemPrompt: 'You are helpful',
      tools: registry,
      toolContext: ctx,
    })) {
      events.push(event)
    }

    const types = events.map(e => e.type)
    expect(types).toContain('tool_call_start')
    expect(types).toContain('tool_call_args')
    expect(types).toContain('tool_result')
    expect(types).toContain('text_start')
    expect(types).toContain('done')

    const toolResult = events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(toolResult.result).toBe('echo: hi')
    expect(toolResult.isError).toBe(false)

    const done = events.find(e => e.type === 'done') as Extract<AgentEvent, { type: 'done' }>
    expect(done.totalUsage.steps).toBe(2)
    expect(done.totalUsage.inputTokens).toBe(25)
  })

  it('should handle permission denial', async () => {
    const { streamText: mockStreamText } = await import('ai')
    const mockedStreamText = vi.mocked(mockStreamText)

    async function* mockFullStream() {
      yield {
        type: 'tool-call' as const,
        toolCallId: 'tc_1',
        toolName: 'Bash',
        args: { command: 'rm -rf /' },
      }
      yield {
        type: 'finish' as const,
        finishReason: 'tool-calls' as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    }

    // After denied tool, the loop should stop since finish reason was tool-calls
    // but the tool result was an error. The model will get another turn.
    async function* mockFullStream2() {
      yield { type: 'text-delta' as const, textDelta: 'OK, I will not do that.' }
      yield {
        type: 'finish' as const,
        finishReason: 'stop' as const,
        usage: { inputTokens: 20, outputTokens: 10 },
      }
    }

    let callCount = 0
    mockedStreamText.mockImplementation(() => {
      callCount++
      return {
        fullStream: callCount === 1 ? mockFullStream() : mockFullStream2(),
      } as unknown as ReturnType<typeof mockStreamText>
    })

    const registry = createToolRegistry()
    registry.register({
      name: 'Bash',
      description: 'Run command',
      parameters: z.object({ command: z.string() }),
      execute: async () => ({ output: 'should not reach' }),
    })
    const ctx: ToolContext = { sessionId: 'test', cwd: '/tmp', abortSignal: new AbortController().signal }

    const mockGate = {
      check: vi.fn().mockResolvedValue({
        requestId: 'r1',
        allowed: false,
        reason: 'Too dangerous',
      }),
      clearCache: vi.fn(),
    }

    const { startAgentLoop } = await import('../agent-loop.js')

    const events: AgentEvent[] = []
    for await (const event of startAgentLoop('Delete everything', {
      model: {} as Parameters<typeof startAgentLoop>[1]['model'],
      systemPrompt: 'You are helpful',
      tools: registry,
      toolContext: ctx,
      permissionGate: mockGate,
    })) {
      events.push(event)
    }

    const toolResult = events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(toolResult.isError).toBe(true)
    expect(toolResult.result).toContain('Permission denied')
    expect(toolResult.result).toContain('Too dangerous')
  })
})
