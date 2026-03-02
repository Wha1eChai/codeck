import { describe, it, expect } from 'vitest'
import { resolveAgents } from './agents.resolver.js'
import type { AgentFile } from '../schemas/agent.schema.js'

function makeAgent(name: string, scope: 'global' | 'project' | 'plugin'): AgentFile {
  return {
    filename: `${name}.md`,
    filePath: `/agents/${name}.md`,
    scope,
    pluginId: scope === 'plugin' ? 'test-plugin' : undefined,
    name,
    frontmatter: {},
    body: '',
  }
}

describe('resolveAgents', () => {
  it('project overrides global by name', () => {
    const result = resolveAgents({
      globalAgents: [makeAgent('reviewer', 'global')],
      projectAgents: [makeAgent('reviewer', 'project')],
      pluginAgents: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('project')
  })

  it('plugin agents added alongside without override', () => {
    const result = resolveAgents({
      globalAgents: [makeAgent('reviewer', 'global')],
      projectAgents: [],
      pluginAgents: [makeAgent('reviewer', 'plugin'), makeAgent('tdd', 'plugin')],
    })
    expect(result).toHaveLength(2)
    expect(result.find((a) => a.name === 'reviewer')!.scope).toBe('global')
    expect(result.find((a) => a.name === 'tdd')!.scope).toBe('plugin')
  })
})
