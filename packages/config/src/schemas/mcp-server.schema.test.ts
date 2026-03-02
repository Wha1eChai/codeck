import { describe, it, expect } from 'vitest'
import { mcpServerEntrySchema } from './mcp-server.schema.js'

describe('mcpServerEntrySchema', () => {
  it('parses a settings-sourced MCP server entry', () => {
    const result = mcpServerEntrySchema.safeParse({
      name: 'context7',
      config: {
        command: 'npx',
        args: ['-y', '@context7/mcp'],
      },
      scope: 'user',
      source: 'settings',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('context7')
      expect(result.data.source).toBe('settings')
      expect(result.data.scope).toBe('user')
    }
  })

  it('parses a plugin-sourced MCP server entry', () => {
    const result = mcpServerEntrySchema.safeParse({
      name: 'plugin-mcp',
      config: {
        command: 'node',
        args: ['server.js'],
        env: { PORT: '3000' },
      },
      scope: 'project',
      source: 'plugin:context7@claude-plugins-official',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('plugin:context7@claude-plugins-official')
    }
  })

  it('parses URL-based MCP server config', () => {
    const result = mcpServerEntrySchema.safeParse({
      name: 'remote-mcp',
      config: {
        url: 'https://mcp.example.com',
        headers: { Authorization: 'Bearer token' },
        type: 'sse',
      },
      scope: 'local',
      source: 'settings',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.config.url).toBe('https://mcp.example.com')
    }
  })

  it('rejects missing name', () => {
    const result = mcpServerEntrySchema.safeParse({
      config: { command: 'npx' },
      scope: 'user',
      source: 'settings',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid scope', () => {
    const result = mcpServerEntrySchema.safeParse({
      name: 'test',
      config: { command: 'npx' },
      scope: 'invalid',
      source: 'settings',
    })
    expect(result.success).toBe(false)
  })
})
