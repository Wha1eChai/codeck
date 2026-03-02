import { describe, expect, it } from 'vitest'
import React from 'react'
import type { Message } from '@common/types'
import { renderToStaticMarkup } from 'react-dom/server'
import { reduceConversation } from '@renderer/lib/conversation-reducer'
import { ConversationFlow, classifySystemMessage } from '../ConversationFlow'

function makeSystemMessage(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'id',
    sessionId: partial.sessionId ?? 'session-1',
    role: partial.role ?? 'system',
    type: partial.type ?? 'text',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? 1,
  }
}

describe('classifySystemMessage', () => {
  it('ignores usage and permission_request messages', () => {
    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'usage',
          content: '',
        }),
      ),
    ).toBe('ignore')

    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'permission_request',
          content: '',
        }),
      ),
    ).toBe('ignore')
  })

  it('routes error and compact to dedicated renderers', () => {
    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'error',
          content: 'failed',
        }),
      ),
    ).toBe('error')

    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'compact',
          content: 'compacted',
        }),
      ),
    ).toBe('compact')
  })

  it('uses banner for non-empty content and fallback otherwise', () => {
    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'text',
          content: 'hook started',
        }),
      ),
    ).toBe('banner')

    expect(
      classifySystemMessage(
        makeSystemMessage({
          type: 'text',
          content: '',
        }),
      ),
    ).toBe('fallback')
  })
})

describe('ConversationFlow rendering', () => {
  it('renders assistant, user, and system groups', () => {
    const messages: Message[] = [
      makeSystemMessage({
        id: 'u1',
        role: 'user',
        type: 'text',
        content: 'user says hello',
        timestamp: 1000,
      }),
      makeSystemMessage({
        id: 'a1',
        role: 'assistant',
        type: 'text',
        content: 'assistant reply',
        timestamp: 2000,
      }),
      makeSystemMessage({
        id: 's1',
        role: 'system',
        type: 'error',
        content: 'system failed',
        timestamp: 3000,
      }),
    ]

    const groups = reduceConversation(messages)
    const html = renderToStaticMarkup(
      React.createElement(ConversationFlow, { groups }),
    )

    expect(html).toContain('user says hello')
    expect(html).toContain('assistant reply')
    expect(html).toContain('system failed')
  })

  it('does not render ignored system messages', () => {
    const messages: Message[] = [
      makeSystemMessage({
        id: 's-usage',
        role: 'system',
        type: 'usage',
        content: '',
      }),
    ]
    const groups = reduceConversation(messages)
    const html = renderToStaticMarkup(
      React.createElement(ConversationFlow, { groups }),
    )

    expect(html).not.toContain('>usage<')
    expect(html).toBe('<div class="animate-message-in" data-group-id="s-usage"></div>')
  })
})
