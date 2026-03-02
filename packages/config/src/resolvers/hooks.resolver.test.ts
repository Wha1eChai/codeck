import { describe, it, expect } from 'vitest'
import { resolveHooks } from './hooks.resolver.js'
import type { HooksMap } from '../schemas/settings.schema.js'
import type { HooksJsonFile } from '../schemas/hooks-json.schema.js'

describe('resolveHooks', () => {
  it('returns empty map for no inputs', () => {
    const result = resolveHooks(undefined, [])
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('processes settings hooks with source "settings"', () => {
    const hooks: HooksMap = {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'echo test', timeout: 30 }],
        },
      ],
    }
    const result = resolveHooks(hooks, [])
    expect(result['PreToolUse']).toHaveLength(1)
    expect(result['PreToolUse']![0]!.source).toBe('settings')
    expect(result['PreToolUse']![0]!.hooks[0]!.source).toBe('settings')
  })

  it('replaces ${CLAUDE_PLUGIN_ROOT} in plugin hook commands', () => {
    const pluginHooks: HooksJsonFile = {
      hooks: {
        PreToolUse: [
          {
            matcher: '',
            hooks: [
              { type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/script.js', timeout: 10 },
            ],
          },
        ],
      },
    }

    const result = resolveHooks(undefined, [
      { pluginId: 'test-plugin@mp', installPath: '/plugins/test', hooksFile: pluginHooks },
    ])

    expect(result['PreToolUse']![0]!.hooks[0]!.command).toBe(
      'node /plugins/test/hooks/script.js',
    )
  })

  it('marks plugin hooks with source "plugin:xxx"', () => {
    const pluginHooks: HooksJsonFile = {
      hooks: {
        Stop: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo done' }] },
        ],
      },
    }

    const result = resolveHooks(undefined, [
      { pluginId: 'my-plugin@mp', installPath: '/p', hooksFile: pluginHooks },
    ])

    expect(result['Stop']![0]!.source).toBe('plugin:my-plugin@mp')
  })

  it('normalizes timeout seconds to timeout_ms', () => {
    const hooks: HooksMap = {
      PostToolUse: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: 'echo', timeout: 60 }],
        },
      ],
    }
    const result = resolveHooks(hooks, [])
    const entry = result['PostToolUse']![0]!.hooks[0]!
    expect(entry.timeout_ms).toBe(60000)
    expect(entry.timeout).toBeUndefined()
  })

  it('merges settings and plugin hooks by event type', () => {
    const settingsHooks: HooksMap = {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo settings' }] },
      ],
    }
    const pluginHooks: HooksJsonFile = {
      hooks: {
        PreToolUse: [
          { matcher: 'Read', hooks: [{ type: 'command', command: 'echo plugin' }] },
        ],
        Stop: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo stop' }] },
        ],
      },
    }

    const result = resolveHooks(settingsHooks, [
      { pluginId: 'p@mp', installPath: '/p', hooksFile: pluginHooks },
    ])

    expect(result['PreToolUse']).toHaveLength(2)
    expect(result['Stop']).toHaveLength(1)
  })
})
