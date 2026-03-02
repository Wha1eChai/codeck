import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseHooksJsonFile } from './hooks-json.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
}))

const { safeReadJson } = await import('../utils/file-io.js')
const mockSafeReadJson = vi.mocked(safeReadJson)

beforeEach(() => vi.clearAllMocks())

describe('parseHooksJsonFile', () => {
  it('returns null when file does not exist', async () => {
    mockSafeReadJson.mockResolvedValue(null)
    expect(await parseHooksJsonFile('/missing')).toBeNull()
  })

  it('parses a valid hooks.json', async () => {
    mockSafeReadJson.mockResolvedValue({
      description: 'Plugin hooks',
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: 'echo test', timeout: 30 },
            ],
          },
        ],
      },
    })

    const result = await parseHooksJsonFile('/hooks.json')
    expect(result).not.toBeNull()
    expect(result!.hooks['PreToolUse']).toHaveLength(1)
  })
})
