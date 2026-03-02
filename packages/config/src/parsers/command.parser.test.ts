import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseCommandFile, scanCommandsDir } from './command.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadFile: vi.fn(),
  safeListDirEntries: vi.fn(),
}))

const { safeReadFile, safeListDirEntries } = await import('../utils/file-io.js')
const mockReadFile = vi.mocked(safeReadFile)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

describe('parseCommandFile', () => {
  it('returns null when file does not exist', async () => {
    mockReadFile.mockResolvedValue(null)
    expect(await parseCommandFile('/cmds/test.md', '/cmds', 'global')).toBeNull()
  })

  it('parses command with frontmatter', async () => {
    mockReadFile.mockResolvedValue(`---
description: Test command
allowed-tools: [Read, Write]
---
Hello $ARGUMENTS`)

    const result = await parseCommandFile('/cmds/test.md', '/cmds', 'global')
    expect(result).not.toBeNull()
    expect(result!.slashName).toBe('test')
    expect(result!.frontmatter['description']).toBe('Test command')
    expect(result!.tokens.hasArguments).toBe(true)
  })

  it('computes slashName with nested paths', async () => {
    mockReadFile.mockResolvedValue('body')
    const result = await parseCommandFile('/cmds/ccs/continue.md', '/cmds', 'global')
    expect(result!.slashName).toBe('ccs:continue')
  })

  it('extracts shell tokens', async () => {
    mockReadFile.mockResolvedValue('Run !`git status` and !`npm test` now')
    const result = await parseCommandFile('/cmds/test.md', '/cmds', 'global')
    expect(result!.tokens.shellTokens).toEqual(['git status', 'npm test'])
  })

  it('detects ${CLAUDE_PLUGIN_ROOT}', async () => {
    mockReadFile.mockResolvedValue('Use ${CLAUDE_PLUGIN_ROOT}/script.js')
    const result = await parseCommandFile('/cmds/test.md', '/cmds', 'plugin', 'my-plugin')
    expect(result!.tokens.hasPluginRoot).toBe(true)
    expect(result!.pluginId).toBe('my-plugin')
  })
})

describe('scanCommandsDir', () => {
  it('returns empty for missing directory', async () => {
    mockListDir.mockResolvedValue([])
    const result = await scanCommandsDir('/missing', 'global')
    expect(result).toEqual([])
  })

  it('scans .md files recursively', async () => {
    // Root has one file and one directory
    mockListDir.mockImplementation(async (dirPath) => {
      if (dirPath === '/cmds') {
        return [
          { name: 'commit.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
          { name: 'sub', isFile: () => false, isDirectory: () => true } as import('node:fs').Dirent,
        ]
      }
      if (dirPath.endsWith('sub')) {
        return [
          { name: 'nested.md', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
        ]
      }
      return []
    })
    mockReadFile.mockResolvedValue('body')

    const result = await scanCommandsDir('/cmds', 'global')
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.slashName).sort()).toEqual(['commit', 'sub:nested'])
  })
})
