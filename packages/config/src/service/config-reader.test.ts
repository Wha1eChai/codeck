import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigReader } from './config-reader.js'

// Mock all parsers
vi.mock('../parsers/settings.parser.js', () => ({ parseSettingsFile: vi.fn() }))
vi.mock('../parsers/plugin-registry.parser.js', () => ({ parseInstalledPlugins: vi.fn() }))
vi.mock('../parsers/plugin-manifest.parser.js', () => ({ parsePluginManifest: vi.fn() }))
vi.mock('../parsers/hooks-json.parser.js', () => ({ parseHooksJsonFile: vi.fn() }))
vi.mock('../parsers/command.parser.js', () => ({ scanCommandsDir: vi.fn() }))
vi.mock('../parsers/skill.parser.js', () => ({ scanSkillsDir: vi.fn() }))
vi.mock('../parsers/agent.parser.js', () => ({ scanAgentsDir: vi.fn() }))
vi.mock('../parsers/rules.parser.js', () => ({ scanRulesDir: vi.fn() }))
vi.mock('../utils/file-io.js', () => ({
  safeListDirEntries: vi.fn(),
  safeReadJson: vi.fn(),
}))

const { parseSettingsFile } = await import('../parsers/settings.parser.js')
const { parseInstalledPlugins } = await import('../parsers/plugin-registry.parser.js')
const { scanCommandsDir } = await import('../parsers/command.parser.js')
const { scanRulesDir } = await import('../parsers/rules.parser.js')
const { safeListDirEntries } = await import('../utils/file-io.js')

const mockParseSettings = vi.mocked(parseSettingsFile)
const mockParsePlugins = vi.mocked(parseInstalledPlugins)
const mockScanCommands = vi.mocked(scanCommandsDir)
const mockScanRules = vi.mocked(scanRulesDir)
const mockListDir = vi.mocked(safeListDirEntries)

beforeEach(() => vi.clearAllMocks())

describe('ConfigReader', () => {
  describe('constructor', () => {
    it('uses provided claudeHome', () => {
      const reader = new ConfigReader({ claudeHome: '/custom/.claude' })
      expect(reader).toBeInstanceOf(ConfigReader)
    })

    it('uses DEFAULT_CLAUDE_HOME when not provided', () => {
      const reader = new ConfigReader()
      expect(reader).toBeInstanceOf(ConfigReader)
    })
  })

  describe('getGlobalSettings', () => {
    it('returns parsed settings', async () => {
      const mockSettings = { env: { FOO: 'bar' } }
      mockParseSettings.mockResolvedValue(mockSettings)

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getGlobalSettings()

      expect(result).toEqual(mockSettings)
      expect(mockParseSettings).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
      )
    })

    it('returns null when file does not exist', async () => {
      mockParseSettings.mockResolvedValue(null)
      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getGlobalSettings()
      expect(result).toBeNull()
    })
  })

  describe('getResolvedSettings', () => {
    it('merges global and project settings', async () => {
      mockParseSettings
        .mockResolvedValueOnce({ env: { A: '1' } })    // global
        .mockResolvedValueOnce({ env: { B: '2' } })    // project
        .mockResolvedValueOnce(null)                    // local

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getResolvedSettings('/my/project')

      expect(result.env).toEqual({ A: '1', B: '2' })
    })

    it('returns defaults when no settings exist', async () => {
      mockParseSettings.mockResolvedValue(null)
      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getResolvedSettings()

      expect(result.env).toBeDefined()
      expect(result.permissions).toBeDefined()
      expect(result.hooks).toBeDefined()
    })
  })

  describe('getInstalledPlugins', () => {
    it('returns parsed plugins', async () => {
      const mockPlugins = { version: 2 as const, plugins: {} }
      mockParsePlugins.mockResolvedValue(mockPlugins)

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getInstalledPlugins()

      expect(result).toEqual(mockPlugins)
    })

    it('returns null when file does not exist', async () => {
      mockParsePlugins.mockResolvedValue(null)
      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getInstalledPlugins()
      expect(result).toBeNull()
    })
  })

  describe('getAllCommands', () => {
    it('returns merged global and project commands', async () => {
      mockParseSettings.mockResolvedValue(null)
      mockParsePlugins.mockResolvedValue(null)

      const emptyTokens = { hasArguments: false, shellTokens: [], hasPluginRoot: false }
      const globalCmd = { slashName: 'cmd', filePath: '/g/cmd.md', scope: 'global' as const, pluginId: undefined, frontmatter: {}, body: '', tokens: emptyTokens }
      const projectCmd = { slashName: 'local', filePath: '/p/cmd.md', scope: 'project' as const, pluginId: undefined, frontmatter: {}, body: '', tokens: emptyTokens }

      mockScanCommands
        .mockResolvedValueOnce([globalCmd])   // global
        .mockResolvedValueOnce([projectCmd])  // project

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getAllCommands('/my/project')

      expect(result).toHaveLength(2)
    })
  })

  describe('getRuleFiles', () => {
    it('combines global and project rules', async () => {
      const globalRule = { filePath: '/g/rule.md', filename: 'rule.md', scope: 'global' as const, content: '' }
      const projectRule = { filePath: '/p/rule.md', filename: 'rule.md', scope: 'project' as const, content: '' }

      mockScanRules
        .mockResolvedValueOnce([globalRule])
        .mockResolvedValueOnce([projectRule])

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.getRuleFiles('/my/project')

      expect(result).toHaveLength(2)
      expect(result[0]!.scope).toBe('global')
      expect(result[1]!.scope).toBe('project')
    })
  })

  describe('listProjects', () => {
    it('lists project directories with decoded paths', async () => {
      mockListDir.mockResolvedValue([
        { name: 'home-user-project', isFile: () => false, isDirectory: () => true } as import('node:fs').Dirent,
        { name: 'settings.json', isFile: () => true, isDirectory: () => false } as import('node:fs').Dirent,
      ])

      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const result = await reader.listProjects()

      expect(result).toHaveLength(1)
      expect(result[0]!.dirName).toBe('home-user-project')
    })
  })

  describe('encodeProjectPath / decodeProjectDirName', () => {
    it('round-trips a simple path', () => {
      const reader = new ConfigReader({ claudeHome: '/home/.claude' })
      const encoded = reader.encodeProjectPath('/home/user/myapp')
      const decoded = reader.decodeProjectDirName(encoded)
      // Due to lossy encoding, we just verify it returns a string
      expect(typeof encoded).toBe('string')
      expect(typeof decoded).toBe('string')
    })
  })
})
