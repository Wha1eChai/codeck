import path from 'node:path'
import { safeReadFile, safeListDirEntries } from '../utils/file-io.js'
import type { RuleFile } from '../schemas/claude-md.schema.js'

export async function parseRuleFile(
  filePath: string,
  scope: 'global' | 'project',
): Promise<RuleFile | null> {
  const content = await safeReadFile(filePath)
  if (content === null) return null

  return {
    filePath,
    filename: path.basename(filePath),
    scope,
    content,
  }
}

export async function scanRulesDir(
  dirPath: string,
  scope: 'global' | 'project',
): Promise<readonly RuleFile[]> {
  const entries = await safeListDirEntries(dirPath)
  const results: RuleFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
    const rule = await parseRuleFile(path.join(dirPath, entry.name), scope)
    if (rule) results.push(rule)
  }

  return results
}
