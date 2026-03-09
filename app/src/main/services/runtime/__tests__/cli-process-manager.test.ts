import { describe, it, expect } from 'vitest'
import { Readable } from 'stream'
import { createLineReader } from '../cli-process-manager'

function createMockStream(chunks: string[]): Readable {
  const stream = new Readable({
    read() {
      for (const chunk of chunks) {
        this.push(Buffer.from(chunk, 'utf-8'))
      }
      this.push(null)
    },
  })
  return stream
}

describe('createLineReader', () => {
  it('yields complete lines from a single chunk', async () => {
    const stream = createMockStream(['line1\nline2\nline3\n'])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual(['line1', 'line2', 'line3'])
  })

  it('handles lines split across chunks', async () => {
    const stream = createMockStream(['hel', 'lo\nwor', 'ld\n'])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual(['hello', 'world'])
  })

  it('yields remaining content without trailing newline', async () => {
    const stream = createMockStream(['line1\nno-newline'])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual(['line1', 'no-newline'])
  })

  it('skips empty lines', async () => {
    const stream = createMockStream(['line1\n\nline2\n'])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual(['line1', 'line2'])
  })

  it('throws on buffer overflow', async () => {
    const hugeChunk = 'x'.repeat(2_000_000) // 2MB without newline
    const stream = createMockStream([hugeChunk])
    const reader = createLineReader(stream, 1_048_576) // 1MB limit

    await expect(async () => {
      for await (const _ of reader) {
        // consume
      }
    }).rejects.toThrow('Line buffer exceeded')
  })

  it('handles empty stream', async () => {
    const stream = createMockStream([])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toEqual([])
  })

  it('handles JSON-lines format', async () => {
    const jsonLines = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}\n',
      '{"type":"result","subtype":"success","cost_usd":0.01}\n',
    ].join('')
    const stream = createMockStream([jsonLines])
    const lines: string[] = []
    for await (const line of createLineReader(stream)) {
      lines.push(line)
    }
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toHaveProperty('type', 'assistant')
    expect(JSON.parse(lines[1]!)).toHaveProperty('type', 'result')
  })
})
