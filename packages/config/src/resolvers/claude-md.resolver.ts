import path from 'node:path'
import { parseClaudeMdFile } from '../parsers/claude-md.parser.js'
import { safeListDirEntries } from '../utils/file-io.js'
import { encodeProjectPath } from '../utils/path-encoding.js'
import {
  CLAUDE_MD_FILENAME,
  PROJECT_CLAUDE_DIR,
  PROJECTS_DIR,
  MEMORY_DIR,
} from '../constants/paths.js'
import type { ClaudeMdFile } from '../schemas/claude-md.schema.js'

/**
 * Discover all CLAUDE.md and memory files for a project, sorted by scope priority.
 */
export async function resolveClaudeMdFiles(
  claudeHome: string,
  projectPath?: string,
): Promise<readonly ClaudeMdFile[]> {
  const results: ClaudeMdFile[] = []

  // 1. User global: ~/.claude/CLAUDE.md
  const globalMd = await parseClaudeMdFile(
    path.join(claudeHome, CLAUDE_MD_FILENAME),
    'user-global',
  )
  if (globalMd) results.push(globalMd)

  if (projectPath) {
    // 2. Project root: <project>/CLAUDE.md
    const projectRootMd = await parseClaudeMdFile(
      path.join(projectPath, CLAUDE_MD_FILENAME),
      'project-root',
      projectPath,
    )
    if (projectRootMd) results.push(projectRootMd)

    // 3. Project .claude dir: <project>/.claude/CLAUDE.md
    const projectClaudeMd = await parseClaudeMdFile(
      path.join(projectPath, PROJECT_CLAUDE_DIR, CLAUDE_MD_FILENAME),
      'project-claude-dir',
      projectPath,
    )
    if (projectClaudeMd) results.push(projectClaudeMd)

    // 4. Local project: ~/.claude/projects/<encoded>/CLAUDE.md
    const encoded = encodeProjectPath(projectPath)
    const localMd = await parseClaudeMdFile(
      path.join(claudeHome, PROJECTS_DIR, encoded, CLAUDE_MD_FILENAME),
      'local-project',
      projectPath,
    )
    if (localMd) results.push(localMd)

    // 5. Memory files: ~/.claude/projects/<encoded>/memory/*.md
    const memoryDir = path.join(claudeHome, PROJECTS_DIR, encoded, MEMORY_DIR)
    const memEntries = await safeListDirEntries(memoryDir)
    for (const entry of memEntries) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      const memMd = await parseClaudeMdFile(
        path.join(memoryDir, entry.name),
        'memory',
        projectPath,
      )
      if (memMd) results.push(memMd)
    }
  }

  return results
}
