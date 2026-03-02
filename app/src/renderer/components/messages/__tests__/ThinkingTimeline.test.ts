import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantThinkingStep } from '@renderer/lib/conversation-reducer'
import { ThinkingTimeline } from '../ThinkingTimeline'

function makeStep(partial: Partial<AssistantThinkingStep>): AssistantThinkingStep {
  return {
    id: partial.id ?? 'thinking-step-1',
    kind: 'thinking',
    messages: partial.messages ?? [],
    content: partial.content ?? '',
    order: partial.order ?? 0,
    startedAt: partial.startedAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    isStreaming: partial.isStreaming ?? false,
  }
}

describe('ThinkingTimeline', () => {
  it('renders summary from latest step key line', () => {
    const steps: AssistantThinkingStep[] = [
      makeStep({
        id: 'step-1',
        content: 'first line.\n\ndetail one',
        order: 0,
      }),
      makeStep({
        id: 'step-2',
        content: 'second key line.\n\ndetail two',
        order: 1,
      }),
    ]

    const html = renderToStaticMarkup(
      React.createElement(ThinkingTimeline, { steps, isStreaming: false }),
    )

    expect(html).toContain('Thinking (2) - latest: second key line.')
    expect(html).toContain('Step 1')
    expect(html).toContain('Step 2')
  })

  it('shows only key line by default for long step content', () => {
    const steps: AssistantThinkingStep[] = [
      makeStep({
        id: 'step-long',
        content: 'Key insight for this step.\n\nHidden detail paragraph should stay collapsed by default.',
        order: 0,
      }),
    ]

    const html = renderToStaticMarkup(
      React.createElement(ThinkingTimeline, { steps, isStreaming: false }),
    )

    expect(html).toContain('Key insight for this step.')
    expect(html).toContain('Show details')
    expect(html).not.toContain('Hidden detail paragraph should stay collapsed by default.')
  })
})
