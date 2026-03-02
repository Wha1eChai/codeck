import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseRuleFile, scanRulesDir } from './rules.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadFile: vi.fn(),
  safeListDirEntries: vi.fn(),
}))

const { safeReadFile, safeListDirEntries } = await import('../utils/file-io.js')
const mockReadFile = vi.mocked(safeReadFile)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

describe('parseRuleFile', () => {
  it('returns null when file does not exist', async () => {
    mockReadFile.mockResolvedValue(null)
    const result = await parseRuleFile('/rules/my-rule.md', 'global')
    expect(result).toBeNull()
  })

  it('parses an existing rule file', async () => {
    mockReadFile.mockResolvedValue('# My Rule\nDo things correctly.')
    const result = await parseRuleFile('/rules/my-rule.md', 'global')
    expect(result).toEqual({
      filePath: '/rules/my-rule.md',
      filename: 'my-rule.md',
      scope: 'global',
      content: '# My Rule\nDo things correctly.',
    })
  })

  it('uses project scope', async () => {
    mockReadFile.mockResolvedValue('project rule')
    const result = await parseRuleFile('/project/.claude/rules/style.md', 'project')
    expect(result?.scope).toBe('project')
    expect(result?.filename).toBe('style.md')
  })
})

describe('scanRulesDir', () => {
  it('returns empty array when directory is empty', async () => {
    mockListDir.mockResolvedValue([])
    const result = await scanRulesDir('/rules', 'global')
    expect(result).toEqual([])
  })

  it('scans and returns .md files only', async () => {
    mockListDir.mockResolvedValue([
      { name: 'coding.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'style.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'README.txt', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'subdir', isFile: () => false, isDirectory: () => true } as import('node:fs').Dirent,
    ])
    mockReadFile.mockImplementation(async (p) => `content of ${p}`)

    const result = await scanRulesDir('/rules', 'global')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.filename)).toEqual(['coding.md', 'style.md'])
  })

  it('skips files that cannot be read', async () => {
    mockListDir.mockResolvedValue([
      { name: 'present.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      { name: 'missing.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
    ])
    mockReadFile.mockImplementation(async (p) => {
      if (typeof p === 'string' && p.includes('present')) return 'content'
      return null
    })

    const result = await scanRulesDir('/rules', 'global')
    expect(result).toHaveLength(1)
    expect(result[0]!.filename).toBe('present.md')
  })
})
