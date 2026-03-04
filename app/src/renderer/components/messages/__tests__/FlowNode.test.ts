// @vitest-environment happy-dom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FlowNode, computeDefaultExpanded } from '../FlowNode'
import type { AssistantToolStep, AssistantHookStep, AssistantThinkingStep } from '@renderer/lib/conversation-reducer'

describe('FlowNode', () => {
  it('renders title and summary text', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, 'IC'),
        title: 'Read',
        summary: '/tmp/demo.ts',
      }),
    )

    expect(html).toContain('Read')
    expect(html).toContain('/tmp/demo.ts')
    expect(html).toContain('IC')
  })

  it('renders subtitle when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'Bash',
        subtitle: 'Done',
      }),
    )

    expect(html).toContain('Bash')
    expect(html).toContain('Done')
  })

  it('renders mcpBadge when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'custom-tool',
        mcpBadge: 'my-server',
      }),
    )

    expect(html).toContain('custom-tool')
    expect(html).toContain('my-server')
  })

  it('applies neutral tone dot style by default', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'Test',
      }),
    )

    // Default tone is 'neutral' which uses 'bg-muted-foreground/70'
    expect(html).toContain('bg-muted-foreground/70')
  })

  it('applies running tone dot style', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'Running task',
        tone: 'running',
      }),
    )

    expect(html).toContain('bg-blue-500')
    expect(html).toContain('animate-pulse')
  })

  it('applies success tone dot style', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'Done task',
        tone: 'success',
      }),
    )

    expect(html).toContain('bg-emerald-500')
  })

  it('applies failed tone dot style', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'Failed task',
        tone: 'failed',
      }),
    )

    expect(html).toContain('bg-red-500')
  })

  it('does not render chevron when there are no children', () => {
    const html = renderToStaticMarkup(
      React.createElement(FlowNode, {
        icon: React.createElement('span', null, '?'),
        title: 'No details',
      }),
    )

    // Without children, no expand/collapse chevron should appear
    expect(html).not.toContain('rotate-180')
    expect(html).toContain('cursor-default')
  })

  it('renders children content when defaultExpanded is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        FlowNode,
        {
          icon: React.createElement('span', null, '?'),
          title: 'With details',
          defaultExpanded: true,
        },
        React.createElement('div', null, 'Detail content here'),
      ),
    )

    expect(html).toContain('Detail content here')
    // Should have expand chevron
    expect(html).toContain('rotate-180')
  })

  it('renders children container (collapsed) when children present but defaultExpanded is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        FlowNode,
        {
          icon: React.createElement('span', null, '?'),
          title: 'Collapsed',
          defaultExpanded: false,
        },
        React.createElement('div', null, 'Hidden content'),
      ),
    )

    // Children are in the DOM but in collapsed grid-rows-[0fr]
    expect(html).toContain('Hidden content')
    expect(html).toContain('grid-rows-[0fr]')
    expect(html).not.toContain('rotate-180')
  })
})

describe('computeDefaultExpanded', () => {
  const baseStep = {
    id: 'step-1',
    order: 0,
    startedAt: 1,
    updatedAt: 2,
    isStreaming: false,
  }

  it('returns true when streaming and is last step', () => {
    const step: AssistantThinkingStep = {
      ...baseStep,
      kind: 'thinking',
      messages: [],
      content: 'thinking...',
    }
    expect(computeDefaultExpanded(step, true, true)).toBe(true)
  })

  it('returns false when streaming but not last step', () => {
    const step: AssistantThinkingStep = {
      ...baseStep,
      kind: 'thinking',
      messages: [],
      content: 'thinking...',
    }
    expect(computeDefaultExpanded(step, false, true)).toBe(false)
  })

  it('returns true for failed tool step', () => {
    const step: AssistantToolStep = {
      ...baseStep,
      kind: 'tool',
      toolName: 'Bash',
      progressMessages: [],
      status: 'failed',
    }
    expect(computeDefaultExpanded(step, false, false)).toBe(true)
  })

  it('returns false for completed tool step that is not last', () => {
    const step: AssistantToolStep = {
      ...baseStep,
      kind: 'tool',
      toolName: 'Read',
      progressMessages: [],
      status: 'completed',
    }
    expect(computeDefaultExpanded(step, false, false)).toBe(false)
  })

  it('returns true for failed hook step', () => {
    const step: AssistantHookStep = {
      ...baseStep,
      kind: 'hook',
      hookName: 'pre-commit',
      hookStatus: 'failed',
      message: { id: 'h1', sessionId: 's1', role: 'system', type: 'text', content: '', timestamp: 1 },
    }
    expect(computeDefaultExpanded(step, false, false)).toBe(true)
  })

  it('returns false for successful hook step', () => {
    const step: AssistantHookStep = {
      ...baseStep,
      kind: 'hook',
      hookName: 'post-edit',
      hookStatus: 'success',
      message: { id: 'h2', sessionId: 's1', role: 'system', type: 'text', content: '', timestamp: 1 },
    }
    expect(computeDefaultExpanded(step, false, false)).toBe(false)
  })
})
