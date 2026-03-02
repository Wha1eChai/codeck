import { describe, expect, it } from 'vitest'
import type { Message } from '@common/types'
import { buildToolBlockViewModel, selectToolBlockContentKind } from './tool-presentation'

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

describe('buildToolBlockViewModel', () => {
  it('uses input summary when result is not available', () => {
    const model = buildToolBlockViewModel(
      makeMessage({
        type: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/demo.ts' },
      }),
    )

    expect(model.status).toBe('running')
    expect(model.displayName).toBe('Read')
    expect(model.summary).toBe('/tmp/demo.ts')
  })

  it('uses result summary and completed status when result succeeds', () => {
    const model = buildToolBlockViewModel(
      makeMessage({
        type: 'tool_use',
        toolName: 'Bash',
        toolInput: { command: 'echo hello' },
      }),
      makeMessage({
        role: 'tool',
        type: 'tool_result',
        content: 'command output',
        success: true,
      }),
    )

    expect(model.status).toBe('completed')
    expect(model.summary).toBe('command output')
  })

  it('marks tool status as failed when result.success is false', () => {
    const model = buildToolBlockViewModel(
      makeMessage({
        type: 'tool_use',
        toolName: 'Bash',
        toolInput: { command: 'false' },
      }),
      makeMessage({
        role: 'tool',
        type: 'tool_result',
        content: 'non-zero exit',
        success: false,
      }),
    )

    expect(model.status).toBe('failed')
  })

  it('detects Edit diff payload and expandable state', () => {
    const model = buildToolBlockViewModel(
      makeMessage({
        type: 'tool_use',
        toolName: 'Edit',
        toolInput: {
          file_path: '/tmp/a.ts',
          old_str: 'const a = 1',
          new_str: 'const a = 2',
        },
      }),
    )

    expect(model.hasDiff).toBe(true)
    expect(model.oldStr).toBe('const a = 1')
    expect(model.newStr).toBe('const a = 2')
    expect(model.hasExpandableContent).toBe(true)
    expect(model.contentKind).toBe('diff')
  })

  it('creates grep input summary in simple-chatapp style', () => {
    const model = buildToolBlockViewModel(
      makeMessage({
        type: 'tool_use',
        toolName: 'Grep',
        toolInput: { pattern: 'TODO', path: 'src' },
      }),
    )

    expect(model.summary).toBe('"TODO" in src')
  })
})

describe('selectToolBlockContentKind', () => {
  it('returns diff when diff payload exists', () => {
    expect(
      selectToolBlockContentKind({
        hasDiff: true,
        writeContent: undefined,
        input: { a: 1 },
      }),
    ).toBe('diff')
  })

  it('returns write for Write payload without diff', () => {
    expect(
      selectToolBlockContentKind({
        hasDiff: false,
        writeContent: 'hello',
        input: { content: 'hello' },
      }),
    ).toBe('write')
  })

  it('returns json when only generic input exists', () => {
    expect(
      selectToolBlockContentKind({
        hasDiff: false,
        writeContent: undefined,
        input: { command: 'ls' },
      }),
    ).toBe('json')
  })

  it('returns none when no expandable content exists', () => {
    expect(
      selectToolBlockContentKind({
        hasDiff: false,
        writeContent: undefined,
        input: undefined,
      }),
    ).toBe('none')
  })
})
