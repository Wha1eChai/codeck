import { describe, it, expect } from 'vitest'
import { resolveSettings } from './settings.resolver.js'
import type { ClaudeSettings } from '../schemas/settings.schema.js'

describe('resolveSettings', () => {
  it('returns defaults for empty layers', () => {
    const result = resolveSettings([])
    expect(result.env).toEqual({})
    expect(result.permissions.allow).toEqual([])
    expect(result.permissions.deny).toEqual([])
    expect(result.permissions.defaultMode).toBeUndefined()
    expect(result.hooks).toEqual({})
    expect(result.enabledPlugins).toEqual({})
    expect(result.mcpServers).toEqual({})
  })

  it('merges env with last-wins per key', () => {
    const result = resolveSettings([
      { settings: { env: { A: '1', B: '2' } } as ClaudeSettings, label: 'global' },
      { settings: { env: { B: '3', C: '4' } } as ClaudeSettings, label: 'project' },
    ])
    expect(result.env).toEqual({ A: '1', B: '3', C: '4' })
  })

  it('merges permissions additively', () => {
    const result = resolveSettings([
      {
        settings: {
          permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
        } as ClaudeSettings,
        label: 'global',
      },
      {
        settings: {
          permissions: { allow: ['Write', 'Read'], deny: ['Bash(sudo:*)'] },
        } as ClaudeSettings,
        label: 'project',
      },
    ])
    // Deduplicated
    expect(result.permissions.allow).toContain('Read')
    expect(result.permissions.allow).toContain('Write')
    expect(result.permissions.deny).toContain('Bash(rm:*)')
    expect(result.permissions.deny).toContain('Bash(sudo:*)')
  })

  it('permissions.defaultMode uses last-wins', () => {
    const result = resolveSettings([
      {
        settings: { permissions: { defaultMode: 'default' } } as ClaudeSettings,
        label: 'global',
      },
      {
        settings: { permissions: { defaultMode: 'acceptEdits' } } as ClaudeSettings,
        label: 'project',
      },
    ])
    expect(result.permissions.defaultMode).toBe('acceptEdits')
  })

  it('merges hooks by concatenating per eventType', () => {
    const globalHooks = {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command' as const, command: 'echo 1' }] }],
    }
    const projectHooks = {
      PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command' as const, command: 'echo 2' }] }],
      Stop: [{ matcher: '', hooks: [{ type: 'command' as const, command: 'echo 3' }] }],
    }

    const result = resolveSettings([
      { settings: { hooks: globalHooks } as ClaudeSettings, label: 'global' },
      { settings: { hooks: projectHooks } as ClaudeSettings, label: 'project' },
    ])

    expect(result.hooks['PreToolUse']).toHaveLength(2)
    expect(result.hooks['Stop']).toHaveLength(1)
  })

  it('merges enabledPlugins per key', () => {
    const result = resolveSettings([
      {
        settings: { enabledPlugins: { 'a@mp': true, 'b@mp': true } } as ClaudeSettings,
        label: 'global',
      },
      {
        settings: { enabledPlugins: { 'b@mp': false, 'c@mp': true } } as ClaudeSettings,
        label: 'project',
      },
    ])
    expect(result.enabledPlugins).toEqual({
      'a@mp': true,
      'b@mp': false,
      'c@mp': true,
    })
  })

  it('normalizes array-format enabledPlugins', () => {
    const result = resolveSettings([
      {
        settings: { enabledPlugins: ['plugin-a', 'plugin-b'] } as ClaudeSettings,
        label: 'global',
      },
    ])
    expect(result.enabledPlugins).toEqual({
      'plugin-a': true,
      'plugin-b': true,
    })
  })

  it('merges mcpServers with last-wins per name', () => {
    const result = resolveSettings([
      {
        settings: {
          mcpServers: {
            server1: { command: 'npx', args: ['old'] },
            server2: { command: 'node', args: ['s2'] },
          },
        } as ClaudeSettings,
        label: 'global',
      },
      {
        settings: {
          mcpServers: {
            server1: { command: 'npx', args: ['new'] },
          },
        } as ClaudeSettings,
        label: 'project',
      },
    ])
    expect(result.mcpServers['server1']?.args).toEqual(['new'])
    expect(result.mcpServers['server2']?.command).toBe('node')
  })

  it('scalar fields use last-wins', () => {
    const result = resolveSettings([
      { settings: { language: 'English', model: 'sonnet' } as ClaudeSettings, label: 'global' },
      { settings: { language: 'Chinese' } as ClaudeSettings, label: 'project' },
    ])
    expect(result.language).toBe('Chinese')
    expect(result.model).toBe('sonnet')
  })

  it('preserves extra keys from all layers', () => {
    const result = resolveSettings([
      {
        settings: { skipDangerousModePermissionPrompt: true, customA: 1 } as ClaudeSettings,
        label: 'global',
      },
      {
        settings: { customB: 2 } as ClaudeSettings,
        label: 'project',
      },
    ])
    expect(result.extra['customA']).toBe(1)
    expect(result.extra['customB']).toBe(2)
  })
})
