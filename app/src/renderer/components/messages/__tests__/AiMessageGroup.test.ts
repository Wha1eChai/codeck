import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '@common/types'
import { reduceConversation, type AssistantMessageGroupView } from '@renderer/lib/conversation-reducer'
import { useSessionStore } from '@renderer/stores/session-store'
import { AiMessageGroup } from '../AiMessageGroup'

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
  }
}

function buildAssistantGroup(messages: Message[]): AssistantMessageGroupView {
  const groups = reduceConversation(messages)
  const assistantGroup = groups.find(group => group.kind === 'assistant')
  if (!assistantGroup || assistantGroup.kind !== 'assistant') {
    throw new Error('Expected at least one assistant group')
  }
  return assistantGroup.assistant
}

describe('AiMessageGroup', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      currentSessionId: null,
      sessionStatus: 'idle',
      currentError: null,
      projectPath: null,
    })
  })

  it('renders mixed assistant flow: thinking, markdown text, tool pair, and tool progress', () => {
    useSessionStore.setState({ sessionStatus: 'streaming' })

    const group = buildAssistantGroup([
      makeMessage({
        id: 'think-1',
        role: 'assistant',
        type: 'thinking',
        content: 'plan first',
        isStreamDelta: true,
      }),
      makeMessage({
        id: 'text-1',
        role: 'assistant',
        type: 'text',
        content: 'final **answer**',
      }),
      makeMessage({
        id: 'tool-use-1',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_1',
        toolInput: { file_path: '/tmp/demo.ts' },
      }),
      makeMessage({
        id: 'tool-result-1',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_1',
        content: 'file body',
        toolResult: 'file body',
        success: true,
      }),
      makeMessage({
        id: 'tool-progress-1',
        role: 'tool',
        type: 'tool_progress',
        toolName: 'Read',
        content: 'Running...',
        timestamp: 2,
      }),
    ])

    const html = renderToStaticMarkup(
      React.createElement(AiMessageGroup, { group }),
    )

    // Thinking node renders with title "Thinking"
    expect(html).toContain('Thinking')
    expect(html).toContain('plan first')
    expect(html).toContain('<strong>answer</strong>')
    // Tool node: display name "Read" and summary from file_path
    expect(html).toContain('Read')
    expect(html).toContain('/tmp/demo.ts')
    expect(html).toContain('file body')
  })

  it('merges multiple thinking messages into separate thinking nodes', () => {
    const group = buildAssistantGroup([
      makeMessage({
        id: 'think-1',
        role: 'assistant',
        type: 'thinking',
        content: 'first thought',
      }),
      makeMessage({
        id: 'think-2',
        role: 'assistant',
        type: 'thinking',
        content: 'second thought',
      }),
    ])

    const html = renderToStaticMarkup(
      React.createElement(AiMessageGroup, { group }),
    )

    // Two separate "Thinking" nodes rendered
    expect(html).toContain('first thought')
    expect(html).toContain('second thought')
    expect((html.match(/Thinking/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders tool-only assistant group without a message card', () => {
    const group = buildAssistantGroup([
      makeMessage({
        id: 'tool-use-only',
        role: 'assistant',
        type: 'tool_use',
        toolName: 'Bash',
        toolUseId: 'toolu_bash',
        toolInput: { command: 'echo hi' },
      }),
      makeMessage({
        id: 'tool-result-only',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Bash',
        toolUseId: 'toolu_bash',
        content: 'hi',
        success: true,
      }),
    ])

    const html = renderToStaticMarkup(
      React.createElement(AiMessageGroup, { group }),
    )

    expect(html).not.toContain('markdown-body')
    // FlowNode renders tool name "Bash" and summary "echo hi"
    expect(html).toContain('Bash')
    expect(html).toContain('echo hi')
    expect(html).toContain('hi')
  })

  it('renders orphan tool_result via standalone tool block', () => {
    const group = buildAssistantGroup([
      makeMessage({
        id: 'orphan-result',
        role: 'tool',
        type: 'tool_result',
        content: 'orphan output',
        toolResult: 'orphan output',
        success: true,
      }),
    ])

    const html = renderToStaticMarkup(
      React.createElement(AiMessageGroup, { group }),
    )

    expect(html).toContain('orphan output')
  })

  it('orders thinking/text/tool sections by step time', () => {
    const group = buildAssistantGroup([
      makeMessage({
        id: 'think-1',
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
        toolInput: { file_path: '/tmp/demo.ts' },
      }),
      makeMessage({
        id: 'tool-result-1',
        role: 'tool',
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_1',
        content: 'file body',
        toolResult: 'file body',
      }),
      makeMessage({
        id: 'text-1',
        role: 'assistant',
        type: 'text',
        content: 'final answer',
      }),
    ])

    const html = renderToStaticMarkup(
      React.createElement(AiMessageGroup, { group }),
    )

    // "Read" tool node appears before "final answer" text
    const readIndex = html.indexOf('Read')
    const textIndex = html.indexOf('final answer')
    expect(readIndex).toBeGreaterThan(-1)
    expect(textIndex).toBeGreaterThan(-1)
    expect(readIndex).toBeLessThan(textIndex)
  })
})
