import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { readTool } from '../read.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Read tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reads a file with line numbers in cat -n format', async () => {
    const filePath = await writeTestFile(tmpDir, 'hello.txt', 'line one\nline two\nline three')
    const result = await readTool.execute({ file_path: filePath }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('1\tline one')
    expect(result.output).toContain('2\tline two')
    expect(result.output).toContain('3\tline three')
  })

  it('supports offset parameter', async () => {
    const filePath = await writeTestFile(tmpDir, 'lines.txt', 'a\nb\nc\nd\ne')
    const result = await readTool.execute({ file_path: filePath, offset: 2 }, ctx)

    expect(result.isError).toBeUndefined()
    // offset=2 means start from 0-indexed line 2 => display line 3
    expect(result.output).toContain('3\tc')
    expect(result.output).toContain('4\td')
    expect(result.output).not.toContain('1\ta')
    expect(result.output).not.toContain('2\tb')
  })

  it('supports limit parameter', async () => {
    const filePath = await writeTestFile(tmpDir, 'lines.txt', 'a\nb\nc\nd\ne')
    const result = await readTool.execute({ file_path: filePath, limit: 2 }, ctx)

    expect(result.isError).toBeUndefined()
    const lines = result.output.split('\n')
    expect(lines).toHaveLength(2)
    expect(result.output).toContain('1\ta')
    expect(result.output).toContain('2\tb')
  })

  it('supports offset + limit together', async () => {
    const filePath = await writeTestFile(tmpDir, 'lines.txt', 'a\nb\nc\nd\ne')
    const result = await readTool.execute({ file_path: filePath, offset: 1, limit: 2 }, ctx)

    expect(result.isError).toBeUndefined()
    const lines = result.output.split('\n')
    expect(lines).toHaveLength(2)
    expect(result.output).toContain('2\tb')
    expect(result.output).toContain('3\tc')
  })

  it('returns error for non-existent file', async () => {
    const result = await readTool.execute({ file_path: path.join(tmpDir, 'nope.txt') }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('File not found')
  })

  it('resolves relative paths against cwd', async () => {
    await writeTestFile(tmpDir, 'sub/file.txt', 'content here')
    const result = await readTool.execute({ file_path: 'sub/file.txt' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('content here')
  })

  it('returns metadata with line counts', async () => {
    const filePath = await writeTestFile(tmpDir, 'meta.txt', 'a\nb\nc')
    const result = await readTool.execute({ file_path: filePath }, ctx)

    expect(result.metadata).toBeDefined()
    expect(result.metadata?.['totalLines']).toBe(3)
    expect(result.metadata?.['linesReturned']).toBe(3)
  })
})
