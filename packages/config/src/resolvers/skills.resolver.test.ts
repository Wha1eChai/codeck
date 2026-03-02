import { describe, it, expect } from 'vitest'
import { resolveSkills } from './skills.resolver.js'
import type { SkillFile } from '../schemas/skill.schema.js'

function makeSkill(name: string, scope: 'global' | 'plugin'): SkillFile {
  return {
    name,
    dirPath: `/skills/${name}`,
    scope,
    pluginId: scope === 'plugin' ? 'test-plugin' : undefined,
    frontmatter: {},
    body: '',
  }
}

describe('resolveSkills', () => {
  it('global skills take precedence over plugin', () => {
    const result = resolveSkills({
      globalSkills: [makeSkill('brainstorming', 'global')],
      pluginSkills: [makeSkill('brainstorming', 'plugin')],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.scope).toBe('global')
  })

  it('plugin skills added when no global match', () => {
    const result = resolveSkills({
      globalSkills: [makeSkill('a', 'global')],
      pluginSkills: [makeSkill('b', 'plugin')],
    })
    expect(result).toHaveLength(2)
  })
})
