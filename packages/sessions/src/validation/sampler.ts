import { readdirSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'

export interface SampleSession {
  sessionId: string
  filePath: string
  fileSize: number
  projectDirName: string
  category: SampleCategory
}

export type SampleCategory =
  | 'random'
  | 'smallest'
  | 'largest'
  | 'with-sidechain'
  | 'no-index'
  | 'with-summary'

export interface SamplerOptions {
  randomCount?: number
  includeSmallest?: number
  includeLargest?: number
  seed?: number
}

/**
 * Sample sessions for validation.
 * Strategy: random 10% + boundary cases.
 */
export function sampleSessions(options: SamplerOptions = {}): SampleSession[] {
  const {
    randomCount = 29,
    includeSmallest = 3,
    includeLargest = 3,
  } = options

  if (!existsSync(CLAUDE_PROJECTS_DIR)) return []

  const allSessions: Array<{ sessionId: string; filePath: string; fileSize: number; projectDirName: string }> = []

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const files = readdirSync(dirPath, { withFileTypes: true })
      .filter((f) => f.isFile() && extname(f.name) === '.jsonl')

    for (const f of files) {
      const filePath = join(dirPath, f.name)
      const stat = statSync(filePath)
      allSessions.push({
        sessionId: f.name.replace('.jsonl', ''),
        filePath,
        fileSize: stat.size,
        projectDirName: dirName,
      })
    }
  }

  if (allSessions.length === 0) return []

  const selected = new Map<string, SampleSession>()

  // Sort by size for boundary cases
  const sortedBySize = [...allSessions].sort((a, b) => a.fileSize - b.fileSize)

  // Smallest files
  for (const s of sortedBySize.slice(0, includeSmallest)) {
    selected.set(s.sessionId, { ...s, category: 'smallest' })
  }

  // Largest files
  for (const s of sortedBySize.slice(-includeLargest)) {
    selected.set(s.sessionId, { ...s, category: 'largest' })
  }

  // Random sample (simple deterministic shuffle using index)
  const remaining = allSessions.filter((s) => !selected.has(s.sessionId))
  const step = Math.max(1, Math.floor(remaining.length / randomCount))
  for (let i = 0; i < remaining.length && selected.size < randomCount + includeSmallest + includeLargest; i += step) {
    const s = remaining[i]!
    if (!selected.has(s.sessionId)) {
      selected.set(s.sessionId, { ...s, category: 'random' })
    }
  }

  return Array.from(selected.values())
}
