import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseSkillDir, scanSkillsDir } from './skill.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadFile: vi.fn(),
  safeListDirEntries: vi.fn(),
}))

const { safeReadFile, safeListDirEntries } = await import('../utils/file-io.js')
const mockReadFile = vi.mocked(safeReadFile)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

describe('parseSkillDir', () => {
  it('returns null when SKILL.md does not exist', async () => {
    mockReadFile.mockResolvedValue(null)
    expect(await parseSkillDir('/skills/test', 'global')).toBeNull()
  })

  it('parses skill with frontmatter name', async () => {
    mockReadFile.mockResolvedValue(`---
name: using-superpowers
description: Use when starting conversations
---
Skill body`)

    const result = await parseSkillDir('/skills/superpowers', 'global')
    expect(result!.name).toBe('using-superpowers')
    expect(result!.body).toBe('Skill body')
  })

  it('falls back to dir name when no frontmatter name', async () => {
    mockReadFile.mockResolvedValue('No frontmatter')
    const result = await parseSkillDir('/skills/my-skill', 'global')
    expect(result!.name).toBe('my-skill')
  })
})

describe('scanSkillsDir', () => {
  it('scans subdirectories for SKILL.md', async () => {
    mockListDir.mockResolvedValue([
      { name: 'skill-a', isFile: () => false, isDirectory: () => true } as import('node:fs').Dirent,
      { name: 'skill-b', isFile: () => false, isDirectory: () => true } as import('node:fs').Dirent,
      { name: 'readme.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
    ])
    mockReadFile.mockImplementation(async (p) => {
      if (typeof p === 'string' && p.includes('skill-a')) return '---\nname: a\n---\nBody A'
      if (typeof p === 'string' && p.includes('skill-b')) return null
      return null
    })

    const result = await scanSkillsDir('/skills', 'global')
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('a')
  })
})
