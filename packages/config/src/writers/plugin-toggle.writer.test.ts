import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginToggleWriter } from './plugin-toggle.writer.js'

vi.mock('../parsers/settings.parser.js', () => ({
  parseSettingsFile: vi.fn(),
}))
vi.mock('../constants/paths.js', () => ({
  globalSettingsPath: vi.fn((home: string) => `${home}/settings.json`),
}))

const { parseSettingsFile } = await import('../parsers/settings.parser.js')
const mockParse = vi.mocked(parseSettingsFile)

function makeSettingsWriter(claudeHome = '/home/.claude') {
  const writeSettingsKey = vi.fn().mockResolvedValue(undefined)
  // Expose claudeHome as the writer class does
  const writer = { claudeHome, writeSettingsKey }
  return writer as unknown as import('./settings.writer.js').SettingsWriter
}

beforeEach(() => vi.clearAllMocks())

describe('PluginToggleWriter', () => {
  it('enables a plugin that is not yet in enabledPlugins', async () => {
    mockParse.mockResolvedValue(null)
    const sw = makeSettingsWriter()
    const toggleWriter = new PluginToggleWriter(sw)

    await toggleWriter.setPluginEnabled('my-plugin', true)

    expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'enabledPlugins', {
      'my-plugin': true,
    })
  })

  it('disables an existing enabled plugin', async () => {
    mockParse.mockResolvedValue({
      enabledPlugins: { 'my-plugin': true, 'other-plugin': true },
    })
    const sw = makeSettingsWriter()
    const toggleWriter = new PluginToggleWriter(sw)

    await toggleWriter.setPluginEnabled('my-plugin', false)

    expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'enabledPlugins', {
      'my-plugin': false,
      'other-plugin': true,
    })
  })

  it('normalizes array-format enabledPlugins', async () => {
    mockParse.mockResolvedValue({
      enabledPlugins: ['plugin-a', 'plugin-b'],
    })
    const sw = makeSettingsWriter()
    const toggleWriter = new PluginToggleWriter(sw)

    await toggleWriter.setPluginEnabled('plugin-c', true)

    // Normalized from array: plugin-a=true, plugin-b=true, then plugin-c=true
    expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'enabledPlugins', {
      'plugin-a': true,
      'plugin-b': true,
      'plugin-c': true,
    })
  })
})
