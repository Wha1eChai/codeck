import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '@common/types'
import { ToolTimeline } from '../ToolTimeline'
import type { AssistantToolStep } from '@renderer/lib/conversation-reducer'

function makeMessage(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'id',
    sessionId: partial.sessionId ?? 'session-1',
    role: partial.role ?? 'assistant',
    type: partial.type ?? 'tool_use',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? 1,
    ...(partial.toolName ? { toolName: partial.toolName } : {}),
    ...(partial.toolInput ? { toolInput: partial.toolInput } : {}),
    ...(partial.toolUseId ? { toolUseId: partial.toolUseId } : {}),
    ...(partial.toolResult ? { toolResult: partial.toolResult } : {}),
    ...(partial.success !== undefined ? { success: partial.success } : {}),
  }
}

function makeStep(partial: Partial<AssistantToolStep>): AssistantToolStep {
  return {
    id: partial.id ?? 'tool-step-1',
    kind: 'tool',
    toolUseId: partial.toolUseId,
    toolName: partial.toolName ?? 'Read',
    useMessage: partial.useMessage,
    resultMessage: partial.resultMessage,
    progressMessages: partial.progressMessages ?? [],
    latestProgressMessage: partial.latestProgressMessage,
    status: partial.status ?? 'running',
    order: partial.order ?? 0,
    startedAt: partial.startedAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    isStreaming: partial.isStreaming ?? false,
  }
}

describe('ToolTimeline', () => {
  it('renders section summary counts', () => {
    const steps: AssistantToolStep[] = [
      makeStep({
        id: 'step-1',
        toolName: 'Read',
        status: 'completed',
        useMessage: makeMessage({
          id: 'use-1',
          role: 'assistant',
          type: 'tool_use',
          toolName: 'Read',
          toolInput: { file_path: '/tmp/a.ts' },
        }),
        resultMessage: makeMessage({
          id: 'result-1',
          role: 'tool',
          type: 'tool_result',
          content: 'ok',
          toolResult: 'ok',
          success: true,
        }),
      }),
      makeStep({
        id: 'step-2',
        toolName: 'Bash',
        status: 'failed',
        useMessage: makeMessage({
          id: 'use-2',
          role: 'assistant',
          type: 'tool_use',
          toolName: 'Bash',
          toolInput: { command: 'false' },
        }),
        resultMessage: makeMessage({
          id: 'result-2',
          role: 'tool',
          type: 'tool_result',
          content: 'command failed',
          toolResult: 'command failed',
          success: false,
        }),
      }),
      makeStep({
        id: 'step-3',
        toolName: 'Grep',
        status: 'running',
        useMessage: makeMessage({
          id: 'use-3',
          role: 'assistant',
          type: 'tool_use',
          toolName: 'Grep',
          toolInput: { pattern: 'TODO' },
        }),
      }),
    ]

    const html = renderToStaticMarkup(
      React.createElement(ToolTimeline, { steps }),
    )

    // New semantic summary format: title shows tool names, suffix shows stats
    expect(html).toContain('Read a.ts, Run: false, Search codebase (3) - 1 done, 1 failed, 1 running')
    expect(html).toContain('Read')
    expect(html).toContain('Bash')
    expect(html).toContain('Grep')
  })

  it('shows failed step details by default', () => {
    const steps: AssistantToolStep[] = [
      makeStep({
        id: 'failed-step',
        toolName: 'Bash',
        status: 'failed',
        useMessage: makeMessage({
          id: 'use-failed',
          role: 'assistant',
          type: 'tool_use',
          toolName: 'Bash',
          toolInput: { command: 'false' },
        }),
        resultMessage: makeMessage({
          id: 'result-failed',
          role: 'tool',
          type: 'tool_result',
          content: 'non-zero exit',
          toolResult: 'non-zero exit',
          success: false,
        }),
      }),
    ]

    const html = renderToStaticMarkup(
      React.createElement(ToolTimeline, { steps }),
    )

    expect(html).toContain('Failed')
    expect(html).toContain('Result')
    expect(html).toContain('non-zero exit')
  })
})
