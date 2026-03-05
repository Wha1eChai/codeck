import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { globTool } from '../glob.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Glob tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('finds files matching a pattern', async () => {
    await writeTestFile(tmpDir, 'src/a.ts', 'a')
    await writeTestFile(tmpDir, 'src/b.ts', 'b')
    await writeTestFile(tmpDir, 'src/c.js', 'c')

    const result = await globTool.execute({ pattern: '**/*.ts' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('a.ts')
    expect(result.output).toContain('b.ts')
    expect(result.output).not.toContain('c.js')
  })

  it('returns absolute paths', async () => {
    await writeTestFile(tmpDir, 'file.txt', 'hello')

    const result = await globTool.execute({ pattern: '*.txt' }, ctx)

    expect(result.isError).toBeUndefined()
    const filePath = result.output.trim()
    expect(path.isAbsolute(filePath)).toBe(true)
  })

  it('returns "No files matched" for empty results', async () => {
    const result = await globTool.execute({ pattern: '**/*.xyz' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('No files matched')
  })

  it('searches in a specified path', async () => {
    await writeTestFile(tmpDir, 'dirA/x.ts', 'x')
    await writeTestFile(tmpDir, 'dirB/y.ts', 'y')

    const result = await globTool.execute({ pattern: '*.ts', path: 'dirA' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('x.ts')
    expect(result.output).not.toContain('y.ts')
  })

  it('includes match count in metadata', async () => {
    await writeTestFile(tmpDir, 'one.ts', '1')
    await writeTestFile(tmpDir, 'two.ts', '2')

    const result = await globTool.execute({ pattern: '*.ts' }, ctx)

    expect(result.metadata?.['count']).toBe(2)
  })

  it('sorts results by modification time (newest first)', async () => {
    await writeTestFile(tmpDir, 'old.ts', 'old')
    // Ensure different mtime by waiting briefly and touching the newer file
    await new Promise((r) => setTimeout(r, 50))
    await writeTestFile(tmpDir, 'new.ts', 'new')

    const result = await globTool.execute({ pattern: '*.ts' }, ctx)
    const lines = result.output.split('\n')

    // Newest file should be first
    expect(lines[0]).toContain('new.ts')
    expect(lines[1]).toContain('old.ts')
  })
})
