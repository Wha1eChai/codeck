import path from 'node:path'
import { safeReadFile, safeListDirEntries } from '../utils/file-io.js'
import { parseFrontmatter } from '../utils/frontmatter.js'
import { SKILL_MD_FILENAME } from '../constants/paths.js'
import type { SkillFile, SkillFrontmatter, SkillScope } from '../schemas/skill.schema.js'

export async function parseSkillDir(
  skillDirPath: string,
  scope: SkillScope,
  pluginId?: string,
): Promise<SkillFile | null> {
  const skillMdPath = path.join(skillDirPath, SKILL_MD_FILENAME)
  const content = await safeReadFile(skillMdPath)
  if (content === null) return null

  const { metadata, body } = parseFrontmatter(content)
  const dirName = path.basename(skillDirPath)

  return {
    name: (metadata['name'] as string) || dirName,
    dirPath: skillDirPath,
    scope,
    pluginId,
    frontmatter: metadata as unknown as SkillFrontmatter,
    body,
  }
}

export async function scanSkillsDir(
  dirPath: string,
  scope: SkillScope,
  pluginId?: string,
): Promise<readonly SkillFile[]> {
  const entries = await safeListDirEntries(dirPath)
  const results: SkillFile[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skill = await parseSkillDir(path.join(dirPath, entry.name), scope, pluginId)
    if (skill) results.push(skill)
  }

  return results
}
