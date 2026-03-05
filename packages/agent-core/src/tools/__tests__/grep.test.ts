import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import { grepTool } from '../grep.js'
import { createTempDir, createTestContext, writeTestFile } from './test-helpers.js'

describe('Grep tool', () => {
  let tmpDir: string
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(async () => {
    tmpDir = await createTempDir()
    ctx = createTestContext(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('finds matching lines in files', async () => {
    await writeTestFile(tmpDir, 'a.txt', 'hello world\ngoodbye world\nhello again')

    const result = await grepTool.execute({ pattern: 'hello' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('hello world')
    expect(result.output).toContain('hello again')
    expect(result.output).not.toContain('goodbye')
  })

  it('supports regex patterns', async () => {
    await writeTestFile(tmpDir, 'code.ts', 'const x = 42\nlet y = "hello"\nconst z = true')

    const result = await grepTool.execute({ pattern: 'const \\w+ =' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('const x = 42')
    expect(result.output).toContain('const z = true')
    expect(result.output).not.toContain('let y')
  })

  it('filters by glob pattern', async () => {
    await writeTestFile(tmpDir, 'src/a.ts', 'findme here')
    await writeTestFile(tmpDir, 'src/b.js', 'findme there')

    const result = await grepTool.execute({ pattern: 'findme', glob: '**/*.ts' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('findme here')
    expect(result.output).not.toContain('findme there')
  })

  it('includes line numbers when requested', async () => {
    await writeTestFile(tmpDir, 'lines.txt', 'aaa\nbbb\nccc\nbbb')

    const result = await grepTool.execute(
      { pattern: 'bbb', include_line_numbers: true },
      ctx,
    )

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain(':2:')
    expect(result.output).toContain(':4:')
  })

  it('returns "No matches" when nothing found', async () => {
    await writeTestFile(tmpDir, 'empty.txt', 'nothing relevant')

    const result = await grepTool.execute({ pattern: 'xyznotfound' }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('No matches')
  })

  it('searches in a specific file path', async () => {
    const filePath = await writeTestFile(tmpDir, 'target.txt', 'alpha\nbeta\ngamma')
    await writeTestFile(tmpDir, 'other.txt', 'alpha elsewhere')

    const result = await grepTool.execute({ pattern: 'alpha', path: filePath }, ctx)

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('alpha')
    // Should not search in other.txt
    expect(result.output).not.toContain('elsewhere')
  })
})
