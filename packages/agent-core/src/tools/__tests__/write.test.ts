import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { writeTool } from '../write.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Write tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a new file', async () => {
    const filePath = path.join(tmpDir, 'new.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'hello world' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('Successfully wrote')
    expect(result.output).toContain('11 bytes')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('hello world')
  })

  it('auto-creates parent directories', async () => {
    const filePath = path.join(tmpDir, 'a', 'b', 'c', 'deep.txt')
    const result = await writeTool.execute({ file_path: filePath, content: 'deep content' }, ctx)

    expect(result.isError).toBeUndefined()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('deep content')
  })

  it('overwrites an existing file', async () => {
    const filePath = await writeTestFile(tmpDir, 'existing.txt', 'old content')
    const result = await writeTool.execute({ file_path: filePath, content: 'new content' }, ctx)

    expect(result.isError).toBeUndefined()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })

  it('resolves relative paths against cwd', async () => {
    const result = await writeTool.execute({ file_path: 'relative.txt', content: 'data' }, ctx)

    expect(result.isError).toBeUndefined()
    const content = await fs.readFile(path.join(tmpDir, 'relative.txt'), 'utf-8')
    expect(content).toBe('data')
  })

  it('returns byte count in metadata', async () => {
    const result = await writeTool.execute(
      { file_path: path.join(tmpDir, 'bytes.txt'), content: 'abc' },
      ctx,
    )

    expect(result.metadata?.['bytes']).toBe(3)
  })
})
