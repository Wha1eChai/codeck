import path from 'node:path'
import { safeReadFile, safeListDirEntries } from '../utils/file-io.js'
import { parseFrontmatter } from '../utils/frontmatter.js'
import type { AgentFile, AgentFrontmatter, AgentScope } from '../schemas/agent.schema.js'

export async function parseAgentFile(
  filePath: string,
  scope: AgentScope,
  pluginId?: string,
): Promise<AgentFile | null> {
  const content = await safeReadFile(filePath)
  if (content === null) return null

  const { metadata, body } = parseFrontmatter(content)
  const filename = path.basename(filePath)
  const nameWithoutExt = filename.replace(/\.md$/i, '')

  return {
    filename,
    filePath,
    scope,
    pluginId,
    name: (metadata['name'] as string) || nameWithoutExt,
    frontmatter: metadata as unknown as AgentFrontmatter,
    body,
  }
}

export async function scanAgentsDir(
  dirPath: string,
  scope: AgentScope,
  pluginId?: string,
): Promise<readonly AgentFile[]> {
  const entries = await safeListDirEntries(dirPath)
  const results: AgentFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
    const agent = await parseAgentFile(path.join(dirPath, entry.name), scope, pluginId)
    if (agent) results.push(agent)
  }

  return results
}
