import { describe, it, expect } from 'vitest'
import { semanticToolSummary, statisticalSuffix } from './tool-summary'
import type { AssistantToolStep } from './conversation-reducer'

function makeStep(
  toolName: string,
  status: AssistantToolStep['status'] = 'completed',
  toolInput?: Record<string, unknown>,
): AssistantToolStep {
  return {
    kind: 'tool',
    id: `step-${Math.random()}`,
    order: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    isStreaming: false,
    toolName,
    status,
    progressMessages: [],
    useMessage: toolInput ? {
      id: 'msg-use',
      sessionId: 'sess',
      role: 'assistant',
      type: 'tool_use',
      content: '',
      timestamp: Date.now(),
      toolName,
      toolInput,
    } : undefined,
  }
}

describe('semanticToolSummary', () => {
  it('returns empty string for empty array', () => {
    expect(semanticToolSummary([])).toBe('')
  })

  it('shows single Read with filename', () => {
    const steps = [makeStep('Read', 'completed', { file_path: '/src/index.ts' })]
    expect(semanticToolSummary(steps)).toBe('Read index.ts')
  })

  it('shows multiple Reads as count', () => {
    const steps = [
      makeStep('Read', 'completed', { file_path: '/a.ts' }),
      makeStep('Read', 'completed', { file_path: '/b.ts' }),
      makeStep('Read', 'completed', { file_path: '/c.ts' }),
    ]
    expect(semanticToolSummary(steps)).toBe('Read 3 files')
  })

  it('shows single Bash with command', () => {
    const steps = [makeStep('Bash', 'completed', { command: 'git status' })]
    expect(semanticToolSummary(steps)).toBe('Run: git status')
  })

  it('truncates long bash commands', () => {
    const cmd = 'npm run build --production --verbose --output=dist/final'
    const steps = [makeStep('Bash', 'completed', { command: cmd })]
    const result = semanticToolSummary(steps)
    expect(result).toContain('Run: ')
    expect(result).toContain('...')
  })

  it('shows mixed tools', () => {
    const steps = [
      makeStep('Read', 'completed', { file_path: '/a.ts' }),
      makeStep('Edit', 'completed', { file_path: '/b.ts' }),
      makeStep('Bash', 'completed', { command: 'git status' }),
    ]
    const result = semanticToolSummary(steps)
    expect(result).toBe('Read a.ts, Edit b.ts, Run: git status')
  })

  it('limits to 3 groups with +N more', () => {
    const steps = [
      makeStep('Read', 'completed'),
      makeStep('Edit', 'completed'),
      makeStep('Bash', 'completed'),
      makeStep('Grep', 'completed'),
      makeStep('Glob', 'completed'),
    ]
    const result = semanticToolSummary(steps)
    expect(result).toContain('+2 more')
  })

  it('handles MCP tool names', () => {
    const steps = [makeStep('mcp__github__create_issue', 'completed')]
    expect(semanticToolSummary(steps)).toBe('github: create_issue')
  })

  it('handles Grep single', () => {
    const steps = [makeStep('Grep', 'completed')]
    expect(semanticToolSummary(steps)).toBe('Search codebase')
  })

  it('handles unknown tools', () => {
    const steps = [makeStep('CustomTool', 'completed')]
    expect(semanticToolSummary(steps)).toBe('CustomTool')
  })

  it('handles unknown tool multiple times', () => {
    const steps = [
      makeStep('CustomTool', 'completed'),
      makeStep('CustomTool', 'completed'),
    ]
    expect(semanticToolSummary(steps)).toBe('CustomTool (2x)')
  })
})

describe('statisticalSuffix', () => {
  it('returns empty for empty array', () => {
    expect(statisticalSuffix([])).toBe('')
  })

  it('shows only done', () => {
    const steps = [
      makeStep('Read', 'completed'),
      makeStep('Edit', 'completed'),
    ]
    expect(statisticalSuffix(steps)).toBe('2 done')
  })

  it('shows mixed statuses', () => {
    const steps = [
      makeStep('Read', 'completed'),
      makeStep('Edit', 'failed'),
      makeStep('Bash', 'running'),
    ]
    expect(statisticalSuffix(steps)).toBe('1 done, 1 failed, 1 running')
  })

  it('shows only failed', () => {
    const steps = [makeStep('Bash', 'failed')]
    expect(statisticalSuffix(steps)).toBe('1 failed')
  })
})
