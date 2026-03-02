import { describe, it, expect } from 'vitest'
import { pairToolCalls, getToolStats } from '../../src/core/tool-tracker.js'
import type { ParsedMessage } from '../../src/core/types.js'

function makeToolUse(toolUseId: string, toolName: string): ParsedMessage {
  return {
    uuid: `use-${toolUseId}`,
    parentUuid: null,
    sessionId: 'test',
    type: 'tool_use',
    role: 'assistant',
    timestamp: Date.now(),
    isSidechain: false,
    lineNumber: 1,
    toolUseId,
    toolName,
    toolInput: { path: '/test' },
  }
}

function makeToolResult(toolUseId: string, success = true): ParsedMessage {
  return {
    uuid: `result-${toolUseId}`,
    parentUuid: null,
    sessionId: 'test',
    type: 'tool_result',
    role: 'tool',
    timestamp: Date.now(),
    isSidechain: false,
    lineNumber: 2,
    toolUseId,
    isError: !success,
    toolResultContent: success ? 'Success' : 'Error',
  }
}

describe('pairToolCalls', () => {
  it('pairs matching tool_use and tool_result', () => {
    const messages: ParsedMessage[] = [
      makeToolUse('t1', 'Read'),
      makeToolResult('t1', true),
      makeToolUse('t2', 'Write'),
      makeToolResult('t2', false),
    ]

    const { paired, unpairedUses, unpairedResults } = pairToolCalls(messages)
    expect(paired).toHaveLength(2)
    expect(unpairedUses).toHaveLength(0)
    expect(unpairedResults).toHaveLength(0)

    const readCall = paired.find((p) => p.toolName === 'Read')!
    expect(readCall.success).toBe(true)
    const writeCall = paired.find((p) => p.toolName === 'Write')!
    expect(writeCall.success).toBe(false)
  })

  it('detects unpaired tool_use (tail calls)', () => {
    const messages: ParsedMessage[] = [
      makeToolUse('t1', 'Bash'),
      // No tool_result for t1
    ]

    const { paired, unpairedUses } = pairToolCalls(messages)
    expect(paired).toHaveLength(0)
    expect(unpairedUses).toHaveLength(1)
  })

  it('detects unpaired tool_result (orphaned)', () => {
    const messages: ParsedMessage[] = [
      makeToolResult('orphan-id', true),
    ]

    const { unpairedResults } = pairToolCalls(messages)
    expect(unpairedResults).toHaveLength(1)
  })

  it('truncates long input/output', () => {
    const longInput = 'x'.repeat(1000)
    const useMsg: ParsedMessage = {
      ...makeToolUse('t1', 'Read'),
      toolInput: { data: longInput },
    }
    const resultMsg: ParsedMessage = {
      ...makeToolResult('t1'),
      toolResultContent: 'y'.repeat(2000),
    }

    const { paired } = pairToolCalls([useMsg, resultMsg])
    expect(paired[0]!.inputJson.length).toBeLessThanOrEqual(500)
    expect(paired[0]!.outputText.length).toBeLessThanOrEqual(1000)
  })
})

describe('getToolStats', () => {
  it('computes success rates', () => {
    const calls = [
      { toolUseId: '1', sessionId: 'test', toolName: 'Read', inputJson: '', outputText: '', success: true, lineNumber: 1 },
      { toolUseId: '2', sessionId: 'test', toolName: 'Read', inputJson: '', outputText: '', success: true, lineNumber: 2 },
      { toolUseId: '3', sessionId: 'test', toolName: 'Read', inputJson: '', outputText: '', success: false, lineNumber: 3 },
    ]

    const stats = getToolStats(calls)
    expect(stats['Read']!.totalCalls).toBe(3)
    expect(stats['Read']!.successCount).toBe(2)
    expect(stats['Read']!.failureCount).toBe(1)
  })
})
