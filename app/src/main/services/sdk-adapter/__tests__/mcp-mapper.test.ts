import { describe, it, expect } from 'vitest'
import { mapMcpServersToSDKConfig } from '../mcp-mapper'
import type { McpServerEntry } from '@codeck/config'

function makeEntry(overrides: Partial<McpServerEntry> & { config: McpServerEntry['config'] }): McpServerEntry {
  return {
    name: 'test-server',
    scope: 'user',
    source: 'settings',
    ...overrides,
  }
}

describe('mapMcpServersToSDKConfig', () => {
  it('maps stdio server correctly', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'my-server',
        config: { command: 'npx', args: ['-y', 'my-mcp'], env: { KEY: 'val' } },
      }),
    ])
    expect(result).toEqual({
      'my-server': {
        command: 'npx',
        args: ['-y', 'my-mcp'],
        env: { KEY: 'val' },
      },
    })
  })

  it('maps explicit stdio type', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'stdio-server',
        config: { type: 'stdio', command: 'node', args: ['server.js'] },
      }),
    ])
    expect(result['stdio-server']).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    })
  })

  it('maps SSE server correctly', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'sse-server',
        config: { type: 'sse', url: 'https://example.com/sse', headers: { Authorization: 'Bearer tok' } },
      }),
    ])
    expect(result['sse-server']).toEqual({
      type: 'sse',
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('maps HTTP server correctly', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'http-server',
        config: { type: 'http', url: 'https://example.com/mcp' },
      }),
    ])
    expect(result['http-server']).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
    })
  })

  it('skips invalid entries (no command, no url)', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'invalid',
        config: {},
      }),
    ])
    expect(result).toEqual({})
  })

  it('omits empty args and env for stdio', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'minimal',
        config: { command: 'my-tool', args: [], env: {} },
      }),
    ])
    expect(result['minimal']).toEqual({ command: 'my-tool' })
    expect('args' in result['minimal']).toBe(false)
    expect('env' in result['minimal']).toBe(false)
  })

  it('omits empty headers for SSE', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({
        name: 'sse-no-headers',
        config: { type: 'sse', url: 'https://example.com/sse' },
      }),
    ])
    expect('headers' in result['sse-no-headers']).toBe(false)
  })

  it('handles multiple servers', () => {
    const result = mapMcpServersToSDKConfig([
      makeEntry({ name: 'a', config: { command: 'a-cmd' } }),
      makeEntry({ name: 'b', config: { type: 'sse', url: 'https://b.com' } }),
      makeEntry({ name: 'c', config: {} }), // invalid — skipped
    ])
    expect(Object.keys(result)).toEqual(['a', 'b'])
  })

  it('returns empty record for empty input', () => {
    const result = mapMcpServersToSDKConfig([])
    expect(result).toEqual({})
  })
})
