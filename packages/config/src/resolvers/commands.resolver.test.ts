import { describe, it, expect } from 'vitest'
import { resolveCommands } from './commands.resolver.js'
import type { CommandFile } from '../schemas/command.schema.js'

function makeCmd(slashName: string, scope: 'global' | 'project' | 'plugin'): CommandFile {
  return {
    slashName,
    filePath: `/path/${slashName}.md`,
    scope,
    pluginId: scope === 'plugin' ? 'test-plugin' : undefined,
    frontmatter: {},
    body: '',
    tokens: { hasArguments: false, shellTokens: [], hasPluginRoot: false },
  }
}

describe('resolveCommands', () => {
  it('returns all commands from all sources', () => {
    const result = resolveCommands({
      globalCommands: [makeCmd('commit', 'global')],
      projectCommands: [makeCmd('deploy', 'project')],
      pluginCommands: [makeCmd('review', 'plugin')],
    })
    expect(result).toHaveLength(3)
  })

  it('project overrides global by slashName', () => {
    const result = resolveCommands({
      globalCommands: [makeCmd('commit', 'global')],
      projectCommands: [makeCmd('commit', 'project')],
      pluginCommands: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('project')
  })

  it('plugin commands do not override global/project', () => {
    const result = resolveCommands({
      globalCommands: [makeCmd('commit', 'global')],
      projectCommands: [],
      pluginCommands: [makeCmd('commit', 'plugin')],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('global')
  })
})
