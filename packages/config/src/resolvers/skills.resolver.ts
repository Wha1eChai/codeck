import type { SkillFile } from '../schemas/skill.schema.js'

interface SkillsResolverInput {
  readonly globalSkills: readonly SkillFile[]
  readonly pluginSkills: readonly SkillFile[]
}

/**
 * Aggregate skills from global + plugins. Global takes precedence.
 */
export function resolveSkills(input: SkillsResolverInput): readonly SkillFile[] {
  const byName = new Map<string, SkillFile>()

  for (const skill of input.globalSkills) {
    byName.set(skill.name, skill)
  }

  for (const skill of input.pluginSkills) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill)
    }
  }

  return [...byName.values()]
}
