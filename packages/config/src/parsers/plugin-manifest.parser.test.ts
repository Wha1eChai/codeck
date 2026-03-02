import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parsePluginManifest } from './plugin-manifest.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
}))

const { safeReadJson } = await import('../utils/file-io.js')
const mockSafeReadJson = vi.mocked(safeReadJson)

beforeEach(() => vi.clearAllMocks())

describe('parsePluginManifest', () => {
  it('returns null when manifest does not exist', async () => {
    mockSafeReadJson.mockResolvedValue(null)
    expect(await parsePluginManifest('/plugin/path')).toBeNull()
  })

  it('parses a valid plugin manifest', async () => {
    mockSafeReadJson.mockResolvedValue({
      name: 'Context7',
      description: 'Up-to-date documentation',
      version: '1.0.0',
      author: { name: 'Author', email: 'test@example.com' },
    })

    const result = await parsePluginManifest('/plugin/path')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Context7')
    expect(result!.author?.name).toBe('Author')
  })
})
