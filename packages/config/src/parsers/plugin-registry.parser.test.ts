import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseInstalledPlugins } from './plugin-registry.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
}))

const { safeReadJson } = await import('../utils/file-io.js')
const mockSafeReadJson = vi.mocked(safeReadJson)

beforeEach(() => vi.clearAllMocks())

describe('parseInstalledPlugins', () => {
  it('returns null when file does not exist', async () => {
    mockSafeReadJson.mockResolvedValue(null)
    expect(await parseInstalledPlugins('/missing')).toBeNull()
  })

  it('parses a valid v2 installed_plugins.json', async () => {
    mockSafeReadJson.mockResolvedValue({
      version: 2,
      plugins: {
        'context7@claude-plugins-official': [
          {
            scope: 'user',
            installPath: 'C:\\Users\\test\\.claude\\plugins\\cache\\context7',
            version: 'abc123',
            installedAt: '2025-12-28T17:18:46.609Z',
            lastUpdated: '2026-02-22T03:25:41.547Z',
          },
        ],
      },
    })

    const result = await parseInstalledPlugins('/plugins/installed_plugins.json')
    expect(result).not.toBeNull()
    expect(result!.version).toBe(2)
    expect(Object.keys(result!.plugins)).toHaveLength(1)
    expect(result!.plugins['context7@claude-plugins-official']![0]!.scope).toBe('user')
  })

  it('returns null for non-object JSON', async () => {
    mockSafeReadJson.mockResolvedValue([1, 2])
    expect(await parseInstalledPlugins('/bad')).toBeNull()
  })
})
