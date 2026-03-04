// @vitest-environment happy-dom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '@common/types'
import type { AssistantToolStep, AssistantThinkingStep, AssistantHookStep } from '@renderer/lib/conversation-reducer'
import {
  ToolNodeDetail,
  ThinkingNodeDetail,
  HookNodeDetail,
  extractKeyLine,
  truncate,
  readResultText,
  extractAgentName,
} from '../FlowNodeDetails'

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
  }
}

const BASE_STEP = {
  id: 'step-1',
  order: 0,
  startedAt: 1,
  updatedAt: 2,
  isStreaming: false,
}

describe('ToolNodeDetail', () => {
  it('renders Bash command and result in unified block', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Bash',
      toolUseId: 'toolu_1',
      progressMessages: [],
      status: 'completed',
      useMessage: makeMessage({
        type: 'tool_use',
        toolName: 'Bash',
        toolInput: { command: 'echo hello' },
      }),
      resultMessage: makeMessage({
        role: 'tool',
        type: 'tool_result',
        toolResult: 'hello',
        content: 'hello',
        success: true,
      }),
    }

    const html = renderToStaticMarkup(
      React.createElement(ToolNodeDetail, { step }),
    )

    expect(html).toContain('echo hello')
    expect(html).toContain('hello')
    expect(html).toContain('$ ')
  })

  it('renders non-Bash tool with input and result', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Read',
      toolUseId: 'toolu_2',
      progressMessages: [],
      status: 'completed',
      useMessage: makeMessage({
        type: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/src/main.ts' },
      }),
      resultMessage: makeMessage({
        role: 'tool',
        type: 'tool_result',
        toolResult: 'const x = 1',
        content: 'const x = 1',
        success: true,
      }),
    }

    const html = renderToStaticMarkup(
      React.createElement(ToolNodeDetail, { step }),
    )

    expect(html).toContain('const x = 1')
  })

  it('renders progress messages when multiple exist', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Read',
      progressMessages: [
        makeMessage({ id: 'p1', type: 'tool_progress', content: 'Step 1...' }),
        makeMessage({ id: 'p2', type: 'tool_progress', content: 'Step 2...' }),
      ],
      status: 'running',
    }

    const html = renderToStaticMarkup(
      React.createElement(ToolNodeDetail, { step }),
    )

    expect(html).toContain('Step 1...')
    expect(html).toContain('Step 2...')
  })
})

describe('ThinkingNodeDetail', () => {
  it('renders key line from thinking content', () => {
    const step: AssistantThinkingStep = {
      ...BASE_STEP,
      kind: 'thinking',
      messages: [],
      content: 'I need to analyze the auth module. Then I will check the tests.',
    }

    const html = renderToStaticMarkup(
      React.createElement(ThinkingNodeDetail, { step }),
    )

    expect(html).toContain('I need to analyze the auth module.')
  })

  it('shows "Show details" button when content is longer than key line', () => {
    const longContent = 'First sentence.\n' + 'A '.repeat(200)
    const step: AssistantThinkingStep = {
      ...BASE_STEP,
      kind: 'thinking',
      messages: [],
      content: longContent,
    }

    const html = renderToStaticMarkup(
      React.createElement(ThinkingNodeDetail, { step }),
    )

    expect(html).toContain('Show details')
  })
})

describe('HookNodeDetail', () => {
  it('renders hook output with neutral style for non-failed hooks', () => {
    const step: AssistantHookStep = {
      ...BASE_STEP,
      kind: 'hook',
      hookName: 'prettier',
      hookStatus: 'success',
      hookOutput: 'Formatted 3 files',
      message: makeMessage({ role: 'system', content: '' }),
    }

    const html = renderToStaticMarkup(
      React.createElement(HookNodeDetail, { step }),
    )

    expect(html).toContain('Formatted 3 files')
    expect(html).not.toContain('text-red-500')
  })

  it('renders failed hook output with red styling', () => {
    const step: AssistantHookStep = {
      ...BASE_STEP,
      kind: 'hook',
      hookName: 'tsc',
      hookStatus: 'failed',
      hookOutput: 'Type error in utils.ts',
      message: makeMessage({ role: 'system', content: '' }),
    }

    const html = renderToStaticMarkup(
      React.createElement(HookNodeDetail, { step }),
    )

    expect(html).toContain('Type error in utils.ts')
    expect(html).toContain('text-red-500')
  })

  it('returns null when hookOutput is absent', () => {
    const step: AssistantHookStep = {
      ...BASE_STEP,
      kind: 'hook',
      hookName: 'silent',
      hookStatus: 'success',
      message: makeMessage({ role: 'system', content: '' }),
    }

    const html = renderToStaticMarkup(
      React.createElement(HookNodeDetail, { step }),
    )

    expect(html).toBe('')
  })
})

describe('extractKeyLine', () => {
  it('extracts first sentence ending with period', () => {
    expect(extractKeyLine('Hello world. More text here.')).toBe('Hello world.')
  })

  it('returns full first line when no sentence boundary', () => {
    expect(extractKeyLine('No period here')).toBe('No period here')
  })

  it('returns empty string for empty input', () => {
    expect(extractKeyLine('')).toBe('')
  })

  it('skips blank leading lines', () => {
    expect(extractKeyLine('\n\n  First real line.')).toBe('First real line.')
  })
})

describe('truncate', () => {
  it('returns original text when shorter than max', () => {
    expect(truncate('short', 100)).toBe('short')
  })

  it('truncates and appends ellipsis when text exceeds max', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })
})

describe('readResultText', () => {
  it('returns toolResult string from result message', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Read',
      progressMessages: [],
      status: 'completed',
      resultMessage: makeMessage({
        role: 'tool',
        type: 'tool_result',
        toolResult: 'file contents',
        content: 'file contents',
      }),
    }

    expect(readResultText(step)).toBe('file contents')
  })

  it('returns null when result message has no content', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Read',
      progressMessages: [],
      status: 'running',
    }

    expect(readResultText(step)).toBe(null)
  })
})

describe('extractAgentName', () => {
  it('extracts description from tool input', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Task',
      progressMessages: [],
      status: 'completed',
      useMessage: makeMessage({
        type: 'tool_use',
        toolInput: { description: 'Analyze auth module' },
      }),
    }

    expect(extractAgentName(step)).toBe('Analyze auth module')
  })

  it('falls back to subagent_type', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Task',
      progressMessages: [],
      status: 'completed',
      useMessage: makeMessage({
        type: 'tool_use',
        toolInput: { subagent_type: 'security-reviewer' },
      }),
    }

    expect(extractAgentName(step)).toBe('security-reviewer')
  })

  it('returns "Agent" when no recognizable fields', () => {
    const step: AssistantToolStep = {
      ...BASE_STEP,
      kind: 'tool',
      toolName: 'Task',
      progressMessages: [],
      status: 'completed',
    }

    expect(extractAgentName(step)).toBe('Agent')
  })
})
