import { describe, expect, it } from 'vitest'
import type { Message } from '@common/types'
import { reduceConversation, groupFlowStepsIntoRuns } from './conversation-reducer'
import type { AssistantFlowStep } from './conversation-reducer'

function makeMessage(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'id',
    sessionId: partial.sessionId ?? 'session-1',
    role: partial.role ?? 'assistant',
    type: partial.type ?? 'text',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? 1,
    ...(partial.toolName ? { toolName: partial.toolName } : {}),
    ...(partial.toolInput ? { toolInput: partial.toolInput } : {}),
    ...(partial.toolUseId ? { toolUseId: partial.toolUseId } : {}),
    ...(partial.toolResult ? { toolResult: partial.toolResult } : {}),
    ...(partial.success !== undefined ? { success: partial.success } : {}),
    ...(partial.usage ? { usage: partial.usage } : {}),
    ...(partial.isStreamDelta !== undefined ? { isStreamDelta: partial.isStreamDelta } : {}),
    ...(partial.isReplay !== undefined ? { isReplay: partial.isReplay } : {}),
    ...(partial.parentToolUseId ? { parentToolUseId: partial.parentToolUseId } : {}),
    ...(partial.hookName ? { hookName: partial.hookName } : {}),
    ...(partial.hookStatus ? { hookStatus: partial.hookStatus as Message['hookStatus'] } : {}),
    ...(partial.hookId ? { hookId: partial.hookId } : {}),
    ...(partial.hookEvent ? { hookEvent: partial.hookEvent } : {}),
  }
}

describe('reduceConversation', () => {
  it('groups contiguous assistant/tool messages and pairs tool results by toolUseId', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'thinking-1',
        role: 'assistant',
        type: 'thinking',
        content: 'plan',
      }),
      makeMessage({
        id: 'tool-use-1',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_1',
      }),
      makeMessage({
        id: 'tool-progress-1',
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Read',
        toolUseId: 'toolu_1',
        content: 'Running...',
      }),
      makeMessage({
        id: 'assistant-text-1',
        role: 'assistant',
        type: 'text',
        content: 'Read completed.',
      }),
      makeMessage({
        id: 'tool-result-1',
        role: 'tool',
        type: 'tool_result',
        toolUseId: 'toolu_1',
        toolResult: 'file content',
        content: 'file content',
        success: true,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    expect(groups[0].assistant.toolPairs).toHaveLength(1)
    expect(groups[0].assistant.toolPairs[0].use.id).toBe('tool-use-1')
    expect(groups[0].assistant.toolPairs[0].result?.id).toBe('tool-result-1')
    expect(groups[0].assistant.text.map(msg => msg.id)).toEqual(['assistant-text-1'])
    expect(groups[0].assistant.other.map(msg => msg.id)).toEqual(['tool-progress-1'])
    expect(groups[0].assistant.flowSteps.map(step => step.kind)).toEqual(['thinking', 'tool', 'text'])
    expect(groups[0].assistant.thinkingSteps).toHaveLength(1)
    expect(groups[0].assistant.thinkingSteps[0].content).toBe('plan')
    expect(groups[0].assistant.textSteps).toHaveLength(1)
    expect(groups[0].assistant.toolSteps).toHaveLength(1)
    expect(groups[0].assistant.toolSteps[0].toolName).toBe('Read')
    expect(groups[0].assistant.toolSteps[0].status).toBe('completed')
    expect(groups[0].assistant.toolSteps[0].progressMessages.map(msg => msg.id)).toEqual(['tool-progress-1'])
    expect(groups[0].assistant.toolSteps[0].latestProgressMessage?.id).toBe('tool-progress-1')
  })

  it('creates user and system groups around assistant groups', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'user-1',
        role: 'user',
        type: 'text',
        content: 'hello',
      }),
      makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        type: 'text',
        content: 'hi',
      }),
      makeMessage({
        id: 'system-1',
        role: 'system',
        type: 'error',
        content: 'boom',
      }),
    ])

    expect(groups.map(group => group.kind)).toEqual(['user', 'assistant', 'system'])
    expect(groups[0].messages[0].id).toBe('user-1')
    expect(groups[2].messages[0].id).toBe('system-1')
  })

  it('keeps orphan tool_result as standalone tool pair', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'orphan-result',
        role: 'tool',
        type: 'tool_result',
        content: 'orphan output',
        toolResult: 'orphan output',
        success: true,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    expect(groups[0].assistant.toolPairs).toHaveLength(1)
    expect(groups[0].assistant.toolPairs[0].use.id).toBe('orphan-result')
    expect(groups[0].assistant.toolPairs[0].result?.id).toBe('orphan-result')
    expect(groups[0].assistant.toolSteps).toHaveLength(1)
    expect(groups[0].assistant.toolSteps[0].status).toBe('completed')
    expect(groups[0].assistant.toolSteps[0].resultMessage?.id).toBe('orphan-result')
  })

  it('pairs results by toolUseId before toolName when names are duplicated', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'read-use-1',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_read_1',
      }),
      makeMessage({
        id: 'read-use-2',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_read_2',
      }),
      makeMessage({
        id: 'read-result-2',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_read_2',
        content: 'second',
      }),
      makeMessage({
        id: 'read-result-1',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_read_1',
        content: 'first',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    const [firstPair, secondPair] = groups[0].assistant.toolPairs
    expect(firstPair.use.id).toBe('read-use-1')
    expect(firstPair.result?.id).toBe('read-result-1')
    expect(secondPair.use.id).toBe('read-use-2')
    expect(secondPair.result?.id).toBe('read-result-2')
    const [firstStep, secondStep] = groups[0].assistant.toolSteps
    expect(firstStep.useMessage?.id).toBe('read-use-1')
    expect(firstStep.resultMessage?.id).toBe('read-result-1')
    expect(secondStep.useMessage?.id).toBe('read-use-2')
    expect(secondStep.resultMessage?.id).toBe('read-result-2')
  })

  it('attaches progress updates to the pending tool step', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'bash-use-1',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Bash',
        toolUseId: 'toolu_bash_1',
      }),
      makeMessage({
        id: 'bash-progress-1',
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Bash',
        toolUseId: 'toolu_bash_1',
        content: 'Running... 0.5s',
      }),
      makeMessage({
        id: 'bash-progress-2',
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Bash',
        toolUseId: 'toolu_bash_1',
        content: 'Running... 1.2s',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    expect(groups[0].assistant.toolSteps).toHaveLength(1)
    expect(groups[0].assistant.toolSteps[0].status).toBe('running')
    expect(groups[0].assistant.toolSteps[0].progressMessages.map(msg => msg.id)).toEqual([
      'bash-progress-1',
      'bash-progress-2',
    ])
    expect(groups[0].assistant.toolSteps[0].latestProgressMessage?.id).toBe('bash-progress-2')
  })

  it('nests sub-agent messages as childSteps of parent tool step', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'agent_use',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Agent',
        toolUseId: 'toolu_agent_1',
        timestamp: 1,
      }),
      makeMessage({
        id: 'sub_text',
        role: 'assistant',
        type: 'text',
        content: 'sub-agent output',
        parentToolUseId: 'toolu_agent_1',
        timestamp: 2,
      }),
      makeMessage({
        id: 'sub_tool',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_sub_read',
        parentToolUseId: 'toolu_agent_1',
        timestamp: 3,
      }),
      makeMessage({
        id: 'sub_result',
        role: 'tool',
        type: 'tool_result',
        content: 'file content',
        toolUseId: 'toolu_sub_read',
        parentToolUseId: 'toolu_agent_1',
        timestamp: 4,
        success: true,
      }),
      makeMessage({
        id: 'agent_result',
        role: 'tool',
        type: 'tool_result',
        content: 'agent done',
        toolUseId: 'toolu_agent_1',
        timestamp: 5,
        success: true,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    // Top-level should only have the Agent tool step, not the child messages
    const agentStep = groups[0].assistant.toolSteps.find(s => s.toolName === 'Agent')
    expect(agentStep).toBeDefined()
    expect(agentStep!.childSteps).toBeDefined()
    expect(agentStep!.childSteps!.length).toBeGreaterThan(0)

    // Child steps should NOT appear in top-level flowSteps
    const topLevelIds = groups[0].assistant.flowSteps.map(s => s.id)
    expect(topLevelIds).not.toContain('text:sub_text')
    expect(topLevelIds).not.toContain('tool:toolu_sub_read')
  })

  it('keeps top-level messages without parentToolUseId in flowSteps', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'top_text',
        role: 'assistant',
        type: 'text',
        content: 'top level',
        timestamp: 1,
      }),
      makeMessage({
        id: 'agent_use',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Agent',
        toolUseId: 'toolu_agent_1',
        timestamp: 2,
      }),
      makeMessage({
        id: 'sub_text',
        role: 'assistant',
        type: 'text',
        content: 'sub output',
        parentToolUseId: 'toolu_agent_1',
        timestamp: 3,
      }),
      makeMessage({
        id: 'agent_result',
        role: 'tool',
        type: 'tool_result',
        content: 'done',
        toolUseId: 'toolu_agent_1',
        timestamp: 4,
        success: true,
      }),
    ])

    expect(groups).toHaveLength(1)
    if (groups[0].kind !== 'assistant') return
    const topLevelIds = groups[0].assistant.flowSteps.map(s => s.id)
    expect(topLevelIds).toContain('text:top_text')
    expect(topLevelIds).not.toContain('text:sub_text')
  })

  it('attaches late progress updates to the latest matching tool step', () => {
    const groups = reduceConversation([
      makeMessage({
        id: 'read-use-1',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_read_1',
      }),
      makeMessage({
        id: 'read-result-1',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_read_1',
        content: 'done',
      }),
      makeMessage({
        id: 'read-progress-late',
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Read',
        content: 'Running...',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('assistant')
    if (groups[0].kind !== 'assistant') return

    expect(groups[0].assistant.toolSteps).toHaveLength(1)
    expect(groups[0].assistant.toolSteps[0].latestProgressMessage?.id).toBe('read-progress-late')
  })

  // ── Hook absorption ──

  describe('hook absorption into assistant groups', () => {
    it('should absorb hook messages into adjacent assistant group', () => {
      const messages: Message[] = [
        makeMessage({ id: 'text1', role: 'assistant', type: 'text', content: 'hello' }),
        makeMessage({ id: 'hook1', role: 'system', type: 'text', content: '[Hook: prettier] Success', hookName: 'prettier', hookStatus: 'completed' }),
        makeMessage({ id: 'tool1', role: 'assistant', type: 'tool_use', content: '', toolName: 'Read', toolUseId: 'toolu_1' }),
        makeMessage({ id: 'result1', role: 'tool', type: 'tool_result', content: 'ok', toolUseId: 'toolu_1', success: true }),
      ]
      const groups = reduceConversation(messages)
      expect(groups).toHaveLength(1)
      expect(groups[0].kind).toBe('assistant')
    })

    it('should create hookSteps in flowSteps at correct chronological position', () => {
      const messages: Message[] = [
        makeMessage({ id: 'text1', role: 'assistant', type: 'text', content: 'hello' }),
        makeMessage({ id: 'hook1', role: 'system', type: 'text', content: '', hookName: 'prettier', hookStatus: 'completed' }),
        makeMessage({ id: 'tool1', role: 'assistant', type: 'tool_use', content: '', toolName: 'Read', toolUseId: 'toolu_1' }),
      ]
      const groups = reduceConversation(messages)
      const assistant = groups[0].kind === 'assistant' ? groups[0].assistant : null
      expect(assistant!.flowSteps).toHaveLength(3)
      expect(assistant!.flowSteps[0].kind).toBe('text')
      expect(assistant!.flowSteps[1].kind).toBe('hook')
      expect(assistant!.flowSteps[2].kind).toBe('tool')
    })

    it('should handle hooks between user messages as standalone assistant group', () => {
      const messages: Message[] = [
        makeMessage({ id: 'user1', role: 'user', type: 'text', content: 'hi' }),
        makeMessage({ id: 'hook1', role: 'system', type: 'text', content: '', hookName: 'startup', hookStatus: 'completed' }),
        makeMessage({ id: 'user2', role: 'user', type: 'text', content: 'bye' }),
      ]
      const groups = reduceConversation(messages)
      expect(groups).toHaveLength(3)
      expect(groups[1].kind).toBe('assistant')
      if (groups[1].kind !== 'assistant') return
      expect(groups[1].assistant.flowSteps[0].kind).toBe('hook')
    })
  })
})

describe('groupFlowStepsIntoRuns', () => {
  it('should merge adjacent same-kind steps into runs', () => {
    const steps = [
      { id: 't1', kind: 'thinking' as const, order: 0, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
      { id: 't2', kind: 'thinking' as const, order: 1, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
      { id: 'x1', kind: 'text' as const, order: 2, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
      { id: 'tl1', kind: 'tool' as const, order: 3, startedAt: 0, updatedAt: 0, isStreaming: false, toolName: 'Read', progressMessages: [], status: 'completed' as const },
      { id: 'tl2', kind: 'tool' as const, order: 4, startedAt: 0, updatedAt: 0, isStreaming: false, toolName: 'Write', progressMessages: [], status: 'completed' as const },
    ] as AssistantFlowStep[]
    const runs = groupFlowStepsIntoRuns(steps)
    expect(runs).toHaveLength(3)
    expect(runs[0].kind).toBe('thinking')
    expect(runs[0].steps).toHaveLength(2)
    expect(runs[2].kind).toBe('tool')
    expect(runs[2].steps).toHaveLength(2)
  })

  it('should keep non-adjacent same-kind as separate runs', () => {
    const steps = [
      { id: 't1', kind: 'thinking' as const, order: 0, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
      { id: 'x1', kind: 'text' as const, order: 1, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
      { id: 't2', kind: 'thinking' as const, order: 2, startedAt: 0, updatedAt: 0, isStreaming: false, messages: [], content: '' },
    ] as AssistantFlowStep[]
    expect(groupFlowStepsIntoRuns(steps)).toHaveLength(3)
  })

  it('should return empty array for empty input', () => {
    expect(groupFlowStepsIntoRuns([])).toEqual([])
  })
})
