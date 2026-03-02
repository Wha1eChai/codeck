import { describe, it, expect } from 'vitest'
import { hooksJsonFileSchema } from './hooks-json.schema.js'

describe('hooksJsonFileSchema', () => {
  it('parses a valid hooks.json file', () => {
    const result = hooksJsonFileSchema.safeParse({
      description: 'Plugin hooks',
      hooks: {
        PreToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: '${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.sh',
                timeout: 30,
              },
            ],
          },
        ],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBe('Plugin hooks')
      const preToolUse = result.data.hooks['PreToolUse']
      expect(preToolUse).toHaveLength(1)
      expect(preToolUse![0]!.hooks[0]!.command).toContain('pre-tool-use.sh')
    }
  })

  it('parses hooks without description', () => {
    const result = hooksJsonFileSchema.safeParse({
      hooks: {
        Stop: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: 'echo done' }],
          },
        ],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })

  it('parses empty hooks map', () => {
    const result = hooksJsonFileSchema.safeParse({
      hooks: {},
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data.hooks)).toHaveLength(0)
    }
  })

  it('parses multiple event types', () => {
    const result = hooksJsonFileSchema.safeParse({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] },
        ],
        PostToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo post' }] },
        ],
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hooks['PreToolUse']).toHaveLength(1)
      expect(result.data.hooks['PostToolUse']).toHaveLength(1)
    }
  })

  it('rejects missing hooks key', () => {
    const result = hooksJsonFileSchema.safeParse({
      description: 'No hooks',
    })
    expect(result.success).toBe(false)
  })

  it('preserves unknown keys via passthrough', () => {
    const result = hooksJsonFileSchema.safeParse({
      hooks: {},
      extraMeta: 'preserved',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['extraMeta']).toBe('preserved')
    }
  })
})
