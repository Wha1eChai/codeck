import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '@common/types'
import { ToolBlock } from '../ToolBlock'

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

describe('ToolBlock', () => {
  it('renders tool name and summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolBlock, {
        useMessage: makeMessage({
          toolName: 'Read',
          toolInput: { file_path: '/tmp/demo.ts' },
        }),
      }),
    )

    expect(html).toContain('Read')
    expect(html).toContain('/tmp/demo.ts')
  })

  it('renders failed status style when tool result fails', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolBlock, {
        useMessage: makeMessage({
          toolName: 'Bash',
          toolInput: { command: 'false' },
        }),
        resultMessage: makeMessage({
          role: 'tool',
          type: 'tool_result',
          success: false,
          content: 'non-zero exit',
        }),
      }),
    )

    expect(html).toContain('bg-red-500')
    expect(html).toContain('non-zero exit')
  })
})

