import { describe, it, expect } from 'vitest'
import {
  pluginEntrySchema,
  installedPluginsSchema,
  marketplaceEntrySchema,
  knownMarketplacesSchema,
  blocklistEntrySchema,
  blocklistSchema,
} from './plugin-registry.schema.js'

describe('pluginEntrySchema', () => {
  it('parses a valid plugin entry', () => {
    const result = pluginEntrySchema.safeParse({
      scope: 'user',
      installPath: '/home/user/.claude/plugins/cache/mp/plugin/abc123',
      version: 'abc123',
      installedAt: '2025-12-28T17:18:46.609Z',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scope).toBe('user')
      expect(result.data.installPath).toContain('abc123')
    }
  })

  it('parses entry with optional fields', () => {
    const result = pluginEntrySchema.safeParse({
      scope: 'workspace',
      installPath: '/path/to/plugin',
      version: '1.0.0',
      installedAt: '2025-01-01T00:00:00.000Z',
      lastUpdated: '2026-02-22T03:25:41.547Z',
      gitCommitSha: 'abc123def456',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lastUpdated).toBe('2026-02-22T03:25:41.547Z')
      expect(result.data.gitCommitSha).toBe('abc123def456')
    }
  })

  it('rejects invalid scope', () => {
    const result = pluginEntrySchema.safeParse({
      scope: 'invalid',
      installPath: '/path',
      version: '1.0',
      installedAt: '2025-01-01T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const result = pluginEntrySchema.safeParse({
      scope: 'user',
    })
    expect(result.success).toBe(false)
  })

  it('preserves unknown keys via passthrough', () => {
    const result = pluginEntrySchema.safeParse({
      scope: 'user',
      installPath: '/path',
      version: '1.0',
      installedAt: '2025-01-01T00:00:00Z',
      customField: 'preserved',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['customField']).toBe('preserved')
    }
  })
})

describe('installedPluginsSchema', () => {
  it('parses a valid installed_plugins.json structure', () => {
    const result = installedPluginsSchema.safeParse({
      version: 2,
      plugins: {
        'context7@claude-plugins-official': [
          {
            scope: 'user',
            installPath: '/home/user/.claude/plugins/cache/context7/abc',
            version: 'abc',
            installedAt: '2025-12-28T17:18:46.609Z',
          },
        ],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.version).toBe(2)
      const entries = result.data.plugins['context7@claude-plugins-official']
      expect(entries).toHaveLength(1)
    }
  })

  it('parses empty plugins', () => {
    const result = installedPluginsSchema.safeParse({
      version: 2,
      plugins: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing version', () => {
    const result = installedPluginsSchema.safeParse({
      plugins: {},
    })
    expect(result.success).toBe(false)
  })
})

describe('marketplaceEntrySchema', () => {
  it('parses a valid marketplace entry', () => {
    const result = marketplaceEntrySchema.safeParse({
      source: { source: 'github', repo: 'org/repo' },
      installLocation: '/home/.claude/plugins/cache/mp',
      lastUpdated: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('parses entry with minimal fields', () => {
    const result = marketplaceEntrySchema.safeParse({
      source: { source: 'local' },
    })
    expect(result.success).toBe(true)
  })
})

describe('knownMarketplacesSchema', () => {
  it('parses a record of marketplace entries', () => {
    const result = knownMarketplacesSchema.safeParse({
      'claude-plugins-official': {
        source: { source: 'github', repo: 'anthropics/claude-plugins' },
        installLocation: '/home/.claude/plugins/cache/official',
        lastUpdated: '2026-01-01T00:00:00Z',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('blocklistEntrySchema', () => {
  it('parses a valid blocklist entry', () => {
    const result = blocklistEntrySchema.safeParse({
      plugin: 'malicious-plugin',
      added_at: '2025-06-01T00:00:00Z',
      reason: 'security',
      text: 'Contains malicious code',
    })
    expect(result.success).toBe(true)
  })

  it('parses entry without optional text', () => {
    const result = blocklistEntrySchema.safeParse({
      plugin: 'bad-plugin',
      added_at: '2025-06-01T00:00:00Z',
      reason: 'policy',
    })
    expect(result.success).toBe(true)
  })
})

describe('blocklistSchema', () => {
  it('parses a valid blocklist file', () => {
    const result = blocklistSchema.safeParse({
      fetchedAt: '2026-02-01T00:00:00Z',
      plugins: [
        {
          plugin: 'bad@marketplace',
          added_at: '2025-06-01T00:00:00Z',
          reason: 'security',
          text: 'Blocked',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.plugins).toHaveLength(1)
    }
  })

  it('parses blocklist with empty plugins array', () => {
    const result = blocklistSchema.safeParse({
      plugins: [],
    })
    expect(result.success).toBe(true)
  })
})
