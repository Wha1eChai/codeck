import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseSettingsFile } from './settings.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
}))

const { safeReadJson } = await import('../utils/file-io.js')
const mockSafeReadJson = vi.mocked(safeReadJson)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseSettingsFile', () => {
  it('returns null when file does not exist', async () => {
    mockSafeReadJson.mockResolvedValue(null)
    expect(await parseSettingsFile('/missing.json')).toBeNull()
  })

  it('returns null for non-object JSON (array)', async () => {
    mockSafeReadJson.mockResolvedValue([1, 2, 3])
    expect(await parseSettingsFile('/array.json')).toBeNull()
  })

  it('parses a valid settings file', async () => {
    mockSafeReadJson.mockResolvedValue({
      env: { KEY: 'value' },
      permissions: { allow: ['Read'], deny: [], defaultMode: 'acceptEdits' },
      language: 'Chinese',
    })
    const result = await parseSettingsFile('/settings.json')
    expect(result).not.toBeNull()
    expect(result!.env).toEqual({ KEY: 'value' })
    expect(result!.language).toBe('Chinese')
  })

  it('preserves unknown keys', async () => {
    mockSafeReadJson.mockResolvedValue({
      customKey: 'customValue',
    })
    const result = await parseSettingsFile('/settings.json')
    expect(result).not.toBeNull()
    expect((result as Record<string, unknown>)['customKey']).toBe('customValue')
  })

  it('handles settings with hooks', async () => {
    mockSafeReadJson.mockResolvedValue({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo test', timeout: 30 }],
          },
        ],
      },
    })
    const result = await parseSettingsFile('/settings.json')
    expect(result).not.toBeNull()
    expect(result!.hooks).toBeDefined()
    expect(result!.hooks!['PreToolUse']).toHaveLength(1)
  })

  it('handles settings with enabledPlugins as record', async () => {
    mockSafeReadJson.mockResolvedValue({
      enabledPlugins: {
        'plugin-a@mp': true,
        'plugin-b@mp': false,
      },
    })
    const result = await parseSettingsFile('/settings.json')
    expect(result).not.toBeNull()
    expect(result!.enabledPlugins).toEqual({
      'plugin-a@mp': true,
      'plugin-b@mp': false,
    })
  })
})
