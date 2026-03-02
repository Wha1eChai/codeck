import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseMcpJsonFile, projectMcpJsonPath } from './mcp-json.parser.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
}))

const { safeReadJson } = await import('../utils/file-io.js')
const mockReadJson = vi.mocked(safeReadJson)

beforeEach(() => vi.clearAllMocks())

describe('parseMcpJsonFile', () => {
  it('returns null when file does not exist', async () => {
    mockReadJson.mockResolvedValue(null)
    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toBeNull()
  })

  it('parses wrapped format { mcpServers: { ... } }', async () => {
    mockReadJson.mockResolvedValue({
      mcpServers: {
        'my-server': { command: 'node', args: ['server.js'] },
        'other-server': { command: 'python', args: ['-m', 'server'], env: { PORT: '3000' } },
      },
    })

    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toHaveLength(2)
    expect(result![0]!.name).toBe('my-server')
    expect(result![0]!.config.command).toBe('node')
    expect(result![1]!.name).toBe('other-server')
    expect(result![1]!.config.env).toEqual({ PORT: '3000' })
  })

  it('parses flat format { name: { command, args } }', async () => {
    mockReadJson.mockResolvedValue({
      'my-server': { command: 'node', args: ['index.js'] },
    })

    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toHaveLength(1)
    expect(result![0]!.name).toBe('my-server')
  })

  it('handles url-based servers', async () => {
    mockReadJson.mockResolvedValue({
      mcpServers: {
        'sse-server': { url: 'http://localhost:8080/sse' },
      },
    })

    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toHaveLength(1)
    expect(result![0]!.config.url).toBe('http://localhost:8080/sse')
  })

  it('skips invalid entries', async () => {
    mockReadJson.mockResolvedValue({
      mcpServers: {
        valid: { command: 'node' },
        invalid: 'not-an-object',
        'also-invalid': null,
      },
    })

    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toHaveLength(1)
    expect(result![0]!.name).toBe('valid')
  })

  it('returns null for non-object data', async () => {
    mockReadJson.mockResolvedValue([1, 2, 3])
    const result = await parseMcpJsonFile('/project/.mcp.json')
    expect(result).toBeNull()
  })
})

describe('projectMcpJsonPath', () => {
  it('joins project path with .mcp.json', () => {
    const result = projectMcpJsonPath('/my/project')
    expect(result).toMatch(/\.mcp\.json$/)
  })
})
