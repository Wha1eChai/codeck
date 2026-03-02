import { describe, it, expect } from 'vitest'
import { parseContentBlocks, mapUsage } from '../content-block-parser'
import {
  textBlock,
  thinkingBlock,
  toolUseBlock,
  toolResultBlock,
  toolResultErrorBlock,
  unknownBlock,
} from './fixtures'

const SESSION_ID = 'test-session'
const PARENT_UUID = 'msg_001'

describe('parseContentBlocks', () => {
  it('should parse a text block', () => {
    const result = parseContentBlocks([textBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'msg_001_block_0',
      sessionId: SESSION_ID,
      role: 'assistant',
      type: 'text',
      content: 'Hello, I can help with that.',
    })
  })

  it('should parse a thinking block', () => {
    const result = parseContentBlocks([thinkingBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'msg_001_block_0',
      role: 'assistant',
      type: 'thinking',
      content: 'I need to analyze the file structure first.',
    })
  })

  it('should parse a tool_use block', () => {
    const result = parseContentBlocks([toolUseBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'msg_001_block_0',
      role: 'assistant',
      type: 'tool_use',
      content: '',
      toolName: 'Read',
      toolInput: { file_path: '/src/index.ts' },
      toolUseId: 'toolu_01ABC',
    })
  })

  it('should parse a successful tool_result block', () => {
    const result = parseContentBlocks([toolResultBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'msg_001_block_0',
      role: 'tool',
      type: 'tool_result',
      content: 'export default function main() {}',
      toolResult: 'export default function main() {}',
      toolUseId: 'toolu_01ABC',
      success: true,
    })
  })

  it('should parse an error tool_result block', () => {
    const result = parseContentBlocks([toolResultErrorBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      role: 'tool',
      type: 'tool_result',
      success: false,
      content: 'File not found',
    })
  })

  it('should handle unknown block types without crashing', () => {
    const result = parseContentBlocks([unknownBlock], SESSION_ID, PARENT_UUID)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      role: 'assistant',
      type: 'text',
      content: '[Unknown content block: some_future_block]',
    })
  })

  it('should fan-out multiple blocks with deterministic IDs', () => {
    const result = parseContentBlocks(
      [thinkingBlock, textBlock, toolUseBlock],
      SESSION_ID,
      PARENT_UUID,
    )

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('msg_001_block_0')
    expect(result[0].type).toBe('thinking')
    expect(result[1].id).toBe('msg_001_block_1')
    expect(result[1].type).toBe('text')
    expect(result[2].id).toBe('msg_001_block_2')
    expect(result[2].type).toBe('tool_use')
  })

  it('should return empty array for empty blocks', () => {
    const result = parseContentBlocks([], SESSION_ID, PARENT_UUID)
    expect(result).toHaveLength(0)
  })
})

describe('mapUsage', () => {
  it('should map SDK usage to internal TokenUsage', () => {
    const result = mapUsage({
      input_tokens: 500,
      output_tokens: 100,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 50,
    })

    expect(result).toEqual({
      inputTokens: 500,
      outputTokens: 100,
      cacheReadTokens: 200,
      cacheWriteTokens: 50,
    })
  })

  it('should handle undefined usage', () => {
    expect(mapUsage(undefined)).toBeUndefined()
  })

  it('should handle usage without cache fields', () => {
    const result = mapUsage({ input_tokens: 100, output_tokens: 50 })

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    })
  })
})
