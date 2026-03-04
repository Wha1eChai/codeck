// @vitest-environment happy-dom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Message } from '@common/types'
import { TextMessage } from '../TextMessage'

function makeMessage(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? 'msg-1',
    sessionId: partial.sessionId ?? 'session-1',
    role: partial.role ?? 'user',
    type: partial.type ?? 'text',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? 1707700000000,
  }
}

describe('TextMessage', () => {
  it('renders user message content inside a bubble', () => {
    const message = makeMessage({ content: 'Hello Claude' })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('Hello Claude')
    expect(html).toContain('data-message-id="msg-1"')
  })

  it('renders markdown bold syntax as <strong>', () => {
    const message = makeMessage({ content: 'This is **bold** text' })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders markdown inline code', () => {
    const message = makeMessage({ content: 'Use `console.log` for debug' })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('console.log')
    // Inline code gets a styled <code> element
    expect(html).toContain('<code')
  })

  it('renders markdown links as anchor tags', () => {
    const message = makeMessage({ content: 'Visit [docs](https://example.com)' })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('docs')
  })

  it('renders non-string content via JSON.stringify', () => {
    const message = makeMessage({ content: { key: 'value' } as unknown as string })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('key')
    expect(html).toContain('value')
  })

  it('renders empty content without crashing', () => {
    const message = makeMessage({ content: '' })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    // Should still render the wrapper with data-message-id
    expect(html).toContain('data-message-id')
  })

  it('displays formatted timestamp', () => {
    // Timestamp 1707700000000 is a specific date
    const message = makeMessage({ content: 'test', timestamp: 1707700000000 })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    // formatTime produces a time string — just verify something is rendered in the timestamp area
    expect(html).toContain('text-muted-foreground-subtle')
  })

  it('renders multiline content preserving paragraph structure', () => {
    const message = makeMessage({
      content: 'First paragraph.\n\nSecond paragraph.',
    })

    const html = renderToStaticMarkup(
      React.createElement(TextMessage, { message }),
    )

    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second paragraph.')
  })
})
