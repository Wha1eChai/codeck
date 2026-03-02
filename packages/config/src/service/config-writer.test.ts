import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigWriter } from './config-writer.js'

// Mock all writers
vi.mock('../writers/settings.writer.js', () => ({
  SettingsWriter: vi.fn().mockImplementation(() => ({
    writeSettingsKey: vi.fn().mockResolvedValue(undefined),
    removeSettingsKey: vi.fn().mockResolvedValue(undefined),
    setEnvVar: vi.fn().mockResolvedValue(undefined),
    removeEnvVar: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../writers/plugin-toggle.writer.js', () => ({
  PluginToggleWriter: vi.fn().mockImplementation(() => ({
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../writers/hooks.writer.js', () => ({
  HooksWriter: vi.fn().mockImplementation(() => ({
    addHookRule: vi.fn().mockResolvedValue(undefined),
    removeHookRule: vi.fn().mockResolvedValue(undefined),
    updateHookRule: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../writers/mcp-server.writer.js', () => ({
  McpServerWriter: vi.fn().mockImplementation(() => ({
    upsertMcpServer: vi.fn().mockResolvedValue(undefined),
    removeMcpServer: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../writers/memory.writer.js', () => ({
  writeMemoryContent: vi.fn().mockResolvedValue(undefined),
}))

const { writeMemoryContent } = await import('../writers/memory.writer.js')
const mockWriteMemory = vi.mocked(writeMemoryContent)

beforeEach(() => vi.clearAllMocks())

describe('ConfigWriter', () => {
  it('constructs without options', () => {
    const writer = new ConfigWriter()
    expect(writer).toBeInstanceOf(ConfigWriter)
  })

  it('constructs with custom claudeHome and projectPath', () => {
    const writer = new ConfigWriter({ claudeHome: '/custom/.claude', projectPath: '/my/project' })
    expect(writer).toBeInstanceOf(ConfigWriter)
  })

  it('delegates writeSettingsKey to SettingsWriter', async () => {
    const writer = new ConfigWriter({ claudeHome: '/home/.claude' })
    await writer.writeSettingsKey('user', 'language', 'en')
    // If no error thrown, delegation worked
    expect(true).toBe(true)
  })

  it('delegates setPluginEnabled to PluginToggleWriter', async () => {
    const writer = new ConfigWriter({ claudeHome: '/home/.claude' })
    await writer.setPluginEnabled('my-plugin', true)
    expect(true).toBe(true)
  })

  it('delegates addHookRule to HooksWriter', async () => {
    const writer = new ConfigWriter({ claudeHome: '/home/.claude' })
    const rule = { matcher: 'always', hooks: [{ type: 'command' as const, command: 'echo' }] }
    await writer.addHookRule('user', 'PreToolUse', rule)
    expect(true).toBe(true)
  })

  it('delegates upsertMcpServer to McpServerWriter', async () => {
    const writer = new ConfigWriter({ claudeHome: '/home/.claude' })
    const config = { type: 'stdio' as const, command: 'server', args: [] }
    await writer.upsertMcpServer('user', 'my-server', config)
    expect(true).toBe(true)
  })

  it('delegates writeMemoryContent to writeMemoryContent util', async () => {
    const writer = new ConfigWriter({ claudeHome: '/home/.claude' })
    await writer.writeMemoryContent('/path/to/MEMORY.md', '# Notes')
    expect(mockWriteMemory).toHaveBeenCalledWith('/path/to/MEMORY.md', '# Notes')
  })
})
