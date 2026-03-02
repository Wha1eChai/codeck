import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../../shared/claude-paths.js'
import { decodeProjectDirName } from '../../shared/project-decoder.js'
import type { SessionsIndex } from '../../core/types.js'

export interface ScannedProject {
  dirName: string
  projectPath: string
  hasSessionsIndex: boolean
  sessions: ScannedSession[]
}

export interface ScannedSession {
  sessionId: string
  filePath: string
  fileSize: number
  fileMtimeMs: number
  projectDirName: string
  // From sessions-index.json if available
  indexData?: {
    firstPrompt?: string
    summary?: string
    messageCount?: number
    gitBranch?: string
    created?: string
    modified?: string
  }
}

/**
 * Scan the filesystem for all projects and sessions.
 * Uses sessions-index.json as fast path for metadata.
 */
export function scanProjects(): ScannedProject[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return []

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  return projectDirs.map((dirName) => {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const projectPath = decodeProjectDirName(dirName)

    // Load sessions index if available
    const indexPath = join(dirPath, 'sessions-index.json')
    let indexEntries: Map<string, SessionsIndex['entries'][0]> | undefined

    if (existsSync(indexPath)) {
      try {
        const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as SessionsIndex
        indexEntries = new Map(raw.entries?.map((e) => [e.sessionId, e]) ?? [])
      } catch {
        // Index parse failed, continue without it
      }
    }

    // Enumerate JSONL files
    const files = readdirSync(dirPath, { withFileTypes: true })
      .filter((f) => f.isFile() && extname(f.name) === '.jsonl')

    const sessions: ScannedSession[] = files.map((f) => {
      const sessionId = f.name.replace('.jsonl', '')
      const filePath = join(dirPath, f.name)
      const stat = statSync(filePath)
      const indexEntry = indexEntries?.get(sessionId)

      return {
        sessionId,
        filePath,
        fileSize: stat.size,
        fileMtimeMs: stat.mtimeMs,
        projectDirName: dirName,
        indexData: indexEntry
          ? {
            firstPrompt: indexEntry.firstPrompt,
            summary: indexEntry.summary,
            messageCount: indexEntry.messageCount,
            gitBranch: indexEntry.gitBranch,
            created: indexEntry.created,
            modified: indexEntry.modified,
          }
          : undefined,
      }
    })

    return {
      dirName,
      projectPath,
      hasSessionsIndex: !!indexEntries,
      sessions,
    }
  })
}
