import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAgentFile, scanAgentsDir } from './agent.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadFile: vi.fn(),
  safeListDirEntries: vi.fn(),
}))

const { safeReadFile, safeListDirEntries } = await import('../utils/file-io.js')
const mockReadFile = vi.mocked(safeReadFile)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

describe('parseAgentFile', () => {
  it('returns null when file does not exist', async () => {
    mockReadFile.mockResolvedValue(null)
    expect(await parseAgentFile('/agents/test.md', 'global')).toBeNull()
  })

  it('parses agent with frontmatter name', async () => {
    mockReadFile.mockResolvedValue(`---
name: code-reviewer
description: Expert code reviewer
model: sonnet
---
Review the code carefully.`)

    const result = await parseAgentFile('/agents/reviewer.md', 'global')
    expect(result!.name).toBe('code-reviewer')
    expect(result!.filename).toBe('reviewer.md')
    expect(result!.frontmatter['model']).toBe('sonnet')
  })

  it('falls back to filename for name', async () => {
    mockReadFile.mockResolvedValue('No frontmatter')
    const result = await parseAgentFile('/agents/planner.md', 'global')
    expect(result!.name).toBe('planner')
  })
})

describe('scanAgentsDir', () => {
  it('scans .md files in directory', async () => {
    mockListDir.mockResolvedValue([
      { name: 'a.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'b.txt', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'c.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
    ])
    mockReadFile.mockResolvedValue('body')

    const result = await scanAgentsDir('/agents', 'global')
    expect(result).toHaveLength(2)
  })
})
