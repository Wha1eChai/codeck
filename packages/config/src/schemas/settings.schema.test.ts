import { describe, it, expect } from 'vitest'
import {
  claudeSettingsSchema,
  hookEntrySchema,
  hookRuleSchema,
  permissionsSchema,
  enabledPluginsSchema,
  normalizeEnabledPlugins,
  mcpServerConfigSchema,
} from './settings.schema.js'

describe('hookEntrySchema', () => {
  it('validates a valid hook entry', () => {
    const result = hookEntrySchema.safeParse({
      type: 'command',
      command: 'echo hello',
      timeout: 30,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = hookEntrySchema.safeParse({
      type: 'invalid',
      command: 'echo',
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = hookEntrySchema.safeParse({
      type: 'command',
      command: 'npx test',
      timeout: 60,
      timeout_ms: 60000,
      statusMessage: 'Testing...',
      async: true,
      description: 'Run tests',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.async).toBe(true)
    }
  })

  it('passes through unknown keys', () => {
    const result = hookEntrySchema.safeParse({
      type: 'command',
      command: 'echo',
      customField: 'value',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['customField']).toBe('value')
    }
  })
})

describe('hookRuleSchema', () => {
  it('validates a hook rule with matcher and hooks', () => {
    const result = hookRuleSchema.safeParse({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo test' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty matcher', () => {
    const result = hookRuleSchema.safeParse({
      matcher: '',
      hooks: [{ type: 'command', command: 'echo' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('permissionsSchema', () => {
  it('validates a complete permissions object', () => {
    const result = permissionsSchema.safeParse({
      allow: ['Bash(git:*)'],
      deny: ['Bash(rm:*)'],
      ask: [],
      defaultMode: 'acceptEdits',
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial permissions', () => {
    const result = permissionsSchema.safeParse({
      allow: ['Read'],
    })
    expect(result.success).toBe(true)
  })
})

describe('enabledPluginsSchema', () => {
  it('validates Record<string, boolean> format', () => {
    const result = enabledPluginsSchema.safeParse({
      'plugin-a@marketplace': true,
      'plugin-b@marketplace': false,
    })
    expect(result.success).toBe(true)
  })

  it('validates string array format', () => {
    const result = enabledPluginsSchema.safeParse(['plugin-a', 'plugin-b'])
    expect(result.success).toBe(true)
  })
})

describe('normalizeEnabledPlugins', () => {
  it('returns empty record for undefined', () => {
    expect(normalizeEnabledPlugins(undefined)).toEqual({})
  })

  it('converts array to record', () => {
    expect(normalizeEnabledPlugins(['a', 'b'])).toEqual({ a: true, b: true })
  })

  it('copies record format', () => {
    const input = { a: true, b: false }
    const result = normalizeEnabledPlugins(input)
    expect(result).toEqual({ a: true, b: false })
    expect(result).not.toBe(input) // immutable copy
  })
})

describe('mcpServerConfigSchema', () => {
  it('validates command-based server', () => {
    const result = mcpServerConfigSchema.safeParse({
      command: 'npx',
      args: ['-y', 'mcp-server'],
      env: { API_KEY: 'test' },
    })
    expect(result.success).toBe(true)
  })

  it('validates URL-based server', () => {
    const result = mcpServerConfigSchema.safeParse({
      url: 'https://mcp.example.com',
      type: 'sse',
    })
    expect(result.success).toBe(true)
  })
})

describe('claudeSettingsSchema', () => {
  it('validates a real settings.json structure', () => {
    const result = claudeSettingsSchema.safeParse({
      env: {
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        CLAUDE_PACKAGE_MANAGER: 'pnpm',
      },
      permissions: {
        allow: ['Bash(git:*)'],
        deny: [],
        ask: [],
        defaultMode: 'acceptEdits',
      },
      hooks: {
        TaskCompleted: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: 'npx vitest run',
                timeout: 120,
                statusMessage: 'Running tests...',
              },
            ],
          },
        ],
      },
      enabledPlugins: {
        'context7@claude-plugins-official': true,
        'hookify@claude-plugins-official': true,
      },
      language: 'Chinese',
      model: 'sonnet',
    })
    expect(result.success).toBe(true)
  })

  it('preserves unknown keys via passthrough', () => {
    const result = claudeSettingsSchema.safeParse({
      skipDangerousModePermissionPrompt: true,
      someUnknownKey: 'preserved',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['someUnknownKey']).toBe('preserved')
    }
  })

  it('accepts empty object', () => {
    const result = claudeSettingsSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
