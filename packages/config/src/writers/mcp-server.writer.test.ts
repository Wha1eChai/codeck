import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServerWriter } from './mcp-server.writer.js'

vi.mock('../parsers/settings.parser.js', () => ({
  parseSettingsFile: vi.fn(),
}))
vi.mock('../constants/paths.js', () => ({
  globalSettingsPath: vi.fn((home: string) => `${home}/settings.json`),
  projectSettingsPath: vi.fn((p: string) => `${p}/.claude/settings.json`),
  localSettingsPath: vi.fn((_h: string, enc: string) => `/home/.claude/projects/${enc}/settings.json`),
}))

const { parseSettingsFile } = await import('../parsers/settings.parser.js')
const mockParse = vi.mocked(parseSettingsFile)

function makeSettingsWriter(claudeHome = '/home/.claude', projectPath?: string) {
  const writeSettingsKey = vi.fn().mockResolvedValue(undefined)
  const writer = { claudeHome, projectPath, writeSettingsKey }
  return writer as unknown as import('./settings.writer.js').SettingsWriter
}

beforeEach(() => vi.clearAllMocks())

describe('McpServerWriter', () => {
  describe('upsertMcpServer', () => {
    it('inserts a new server into an empty map', async () => {
      mockParse.mockResolvedValue(null)
      const sw = makeSettingsWriter()
      const mw = new McpServerWriter(sw)
      const config = { type: 'stdio' as const, command: 'my-server', args: [] }

      await mw.upsertMcpServer('user', 'my-server', config)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'mcpServers', {
        'my-server': config,
      })
    })

    it('updates an existing server by name', async () => {
      const existingConfig = { type: 'stdio' as const, command: 'old', args: [] }
      const otherConfig = { type: 'stdio' as const, command: 'other', args: [] }
      mockParse.mockResolvedValue({
        mcpServers: { 'my-server': existingConfig, other: otherConfig },
      })
      const sw = makeSettingsWriter()
      const mw = new McpServerWriter(sw)
      const newConfig = { type: 'stdio' as const, command: 'new', args: ['--flag'] }

      await mw.upsertMcpServer('user', 'my-server', newConfig)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'mcpServers', {
        'my-server': newConfig,
        other: otherConfig,
      })
    })
  })

  describe('removeMcpServer', () => {
    it('removes an existing server', async () => {
      const cfg = { type: 'stdio' as const, command: 'x', args: [] }
      mockParse.mockResolvedValue({ mcpServers: { target: cfg } })
      const sw = makeSettingsWriter()
      const mw = new McpServerWriter(sw)

      await mw.removeMcpServer('user', 'target')

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'mcpServers', {})
    })

    it('does nothing when server does not exist', async () => {
      mockParse.mockResolvedValue(null)
      const sw = makeSettingsWriter()
      const mw = new McpServerWriter(sw)

      await mw.removeMcpServer('user', 'nonexistent')

      expect(sw.writeSettingsKey).not.toHaveBeenCalled()
    })
  })
})
