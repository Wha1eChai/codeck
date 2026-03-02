import path from 'node:path'
import { safeReadFile } from '../utils/file-io.js'
import type { ClaudeMdFile, ClaudeMdScope } from '../schemas/claude-md.schema.js'

export async function parseClaudeMdFile(
  filePath: string,
  scope: ClaudeMdScope,
  projectPath?: string,
): Promise<ClaudeMdFile | null> {
  const content = await safeReadFile(filePath)
  if (content === null) return null

  return {
    filePath,
    scope,
    projectPath,
    content,
    name: scope === 'memory' ? path.basename(filePath) : undefined,
  }
}
