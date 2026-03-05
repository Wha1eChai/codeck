import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { editTool } from '../edit.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Edit tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('replaces a unique string', async () => {
    const filePath = await writeTestFile(tmpDir, 'test.txt', 'hello world')
    const result = await editTool.execute(
      { file_path: filePath, old_string: 'hello', new_string: 'goodbye' },
      ctx,
    )

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('1 occurrence')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('goodbye world')
  })

  it('returns error when old_string is not unique and replace_all is false', async () => {
    const filePath = await writeTestFile(tmpDir, 'test.txt', 'foo bar foo baz foo')
    const result = await editTool.execute(
      { file_path: filePath, old_string: 'foo', new_string: 'qux' },
      ctx,
    )

    expect(result.isError).toBe(true)
    expect(result.output).toContain('not unique')
    expect(result.output).toContain('3 occurrences')

    // File should be unchanged
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('foo bar foo baz foo')
  })

  it('replaces all occurrences with replace_all', async () => {
    const filePath = await writeTestFile(tmpDir, 'test.txt', 'foo bar foo baz foo')
    const result = await editTool.execute(
      { file_path: filePath, old_string: 'foo', new_string: 'qux', replace_all: true },
      ctx,
    )

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('3 occurrences')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('qux bar qux baz qux')
  })

  it('returns error when old_string is not found', async () => {
    const filePath = await writeTestFile(tmpDir, 'test.txt', 'hello world')
    const result = await editTool.execute(
      { file_path: filePath, old_string: 'missing', new_string: 'replacement' },
      ctx,
    )

    expect(result.isError).toBe(true)
    expect(result.output).toContain('not found')
  })

  it('returns error for non-existent file', async () => {
    const result = await editTool.execute(
      {
        file_path: path.join(tmpDir, 'nope.txt'),
        old_string: 'a',
        new_string: 'b',
      },
      ctx,
    )

    expect(result.isError).toBe(true)
    expect(result.output).toContain('File not found')
  })

  it('handles multiline replacement', async () => {
    const filePath = await writeTestFile(tmpDir, 'multi.txt', 'line1\nline2\nline3')
    const result = await editTool.execute(
      { file_path: filePath, old_string: 'line1\nline2', new_string: 'replaced' },
      ctx,
    )

    expect(result.isError).toBeUndefined()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('replaced\nline3')
  })
})
