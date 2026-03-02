import { describe, it, expect } from 'vitest'
import { pluginManifestSchema, pluginAuthorSchema } from './plugin-manifest.schema.js'

describe('pluginAuthorSchema', () => {
  it('parses author with name and email', () => {
    const result = pluginAuthorSchema.safeParse({
      name: 'Test Author',
      email: 'test@example.com',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Test Author')
      expect(result.data.email).toBe('test@example.com')
    }
  })

  it('parses author without email', () => {
    const result = pluginAuthorSchema.safeParse({
      name: 'Test Author',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = pluginAuthorSchema.safeParse({
      email: 'test@example.com',
    })
    expect(result.success).toBe(false)
  })
})

describe('pluginManifestSchema', () => {
  it('parses a full manifest', () => {
    const result = pluginManifestSchema.safeParse({
      name: 'context7',
      description: 'Context7 MCP plugin',
      version: '1.0.0',
      author: { name: 'Anthropic', email: 'hello@anthropic.com' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('context7')
      expect(result.data.description).toBe('Context7 MCP plugin')
      expect(result.data.version).toBe('1.0.0')
      expect(result.data.author?.name).toBe('Anthropic')
    }
  })

  it('parses a minimal manifest', () => {
    const result = pluginManifestSchema.safeParse({
      name: 'my-plugin',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('my-plugin')
      expect(result.data.description).toBeUndefined()
      expect(result.data.version).toBeUndefined()
      expect(result.data.author).toBeUndefined()
    }
  })

  it('rejects missing name', () => {
    const result = pluginManifestSchema.safeParse({
      description: 'No name provided',
    })
    expect(result.success).toBe(false)
  })

  it('preserves unknown keys via passthrough', () => {
    const result = pluginManifestSchema.safeParse({
      name: 'test',
      customField: 'extra',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['customField']).toBe('extra')
    }
  })
})
