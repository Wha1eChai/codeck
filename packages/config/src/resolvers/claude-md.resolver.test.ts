import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveClaudeMdFiles } from './claude-md.resolver.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadFile: vi.fn(),
  safeListDirEntries: vi.fn(),
}))

const { safeReadFile, safeListDirEntries } = await import('../utils/file-io.js')
const mockReadFile = vi.mocked(safeReadFile)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

/** Normalize path separators for cross-platform matching */
const norm = (s: string) => s.replace(/\\/g, '/')

describe('resolveClaudeMdFiles', () => {
  it('returns empty when no files exist', async () => {
    mockReadFile.mockResolvedValue(null)
    mockListDir.mockResolvedValue([])
    const result = await resolveClaudeMdFiles('/home/.claude')
    expect(result).toEqual([])
  })

  it('discovers global CLAUDE.md', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if (typeof p === 'string' && norm(p).endsWith('.claude/CLAUDE.md')) return '# Global'
      return null
    })
    mockListDir.mockResolvedValue([])

    const result = await resolveClaudeMdFiles('/home/.claude')
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('user-global')
  })

  it('discovers all scopes with project path', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if (typeof p === 'string') {
        const n = norm(p)
        if (n.endsWith('.claude/CLAUDE.md') && !n.includes('project')) return '# Global'
        if (n.endsWith('my-project/CLAUDE.md') && !n.includes('.claude')) return '# Project root'
        if (n.endsWith('my-project/.claude/CLAUDE.md')) return '# Project .claude'
      }
      return null
    })
    mockListDir.mockResolvedValue([])

    const result = await resolveClaudeMdFiles('/home/.claude', '/home/my-project')
    expect(result).toHaveLength(3)
    expect(result.map((f) => f.scope)).toEqual([
      'user-global',
      'project-root',
      'project-claude-dir',
    ])
  })

  it('discovers memory files', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if (typeof p === 'string' && p.includes('memory')) return '# Memory content'
      return null
    })
    mockListDir.mockImplementation(async (dirPath) => {
      if (typeof dirPath === 'string' && dirPath.includes('memory')) {
        return [
          { name: 'MEMORY.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
        ]
      }
      return []
    })

    const result = await resolveClaudeMdFiles('/home/.claude', '/home/project')
    const memFiles = result.filter((f) => f.scope === 'memory')
    expect(memFiles).toHaveLength(1)
    expect(memFiles[0]!.name).toBe('MEMORY.md')
  })
})
