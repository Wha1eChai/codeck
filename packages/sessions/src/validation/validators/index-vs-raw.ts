import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../../shared/claude-paths.js'
import { readAllJsonlEntries } from '../../core/jsonl-reader.js'
import { classifyEntry } from '../../core/classifier.js'
import type { SessionsIndex } from '../../core/types.js'

export interface IndexVsRawResult {
  sessionId: string
  filePath: string
  passed: boolean
  hasIndex: boolean
  indexMessageCount?: number
  actualMessageCount: number
  countDiscrepancy?: number
  indexFirstPrompt?: string
  actualFirstPrompt?: string
  firstPromptMatch?: boolean
  errors: string[]
}

/**
 * Validate sessions-index.json data against actual JSONL content.
 * Allows ±5 message count discrepancy.
 */
export async function validateIndexVsRaw(
  sessionId: string,
  filePath: string,
  projectDirName: string,
): Promise<IndexVsRawResult> {
  const errors: string[] = []

  const indexPath = join(CLAUDE_PROJECTS_DIR, projectDirName, 'sessions-index.json')
  if (!existsSync(indexPath)) {
    const allEntries = await readAllJsonlEntries(filePath)
    const messages = allEntries.flatMap(({ entry, lineNo }) => classifyEntry(entry, lineNo))
    const userMessages = messages.filter((m) => m.role === 'user' && m.type === 'text')

    return {
      sessionId,
      filePath,
      passed: true,
      hasIndex: false,
      actualMessageCount: userMessages.length,
      errors,
    }
  }

  let indexEntry: SessionsIndex['entries'][0] | undefined
  try {
    const indexData = JSON.parse(readFileSync(indexPath, 'utf-8')) as SessionsIndex
    indexEntry = indexData.entries?.find((e) => e.sessionId === sessionId)
  } catch (err) {
    errors.push(`Failed to parse sessions-index.json: ${err}`)
  }

  const allEntries = await readAllJsonlEntries(filePath)
  const messages = allEntries.flatMap(({ entry, lineNo }) => classifyEntry(entry, lineNo))
  const userMessages = messages.filter((m) => m.role === 'user' && m.type === 'text')
  const actualCount = userMessages.length
  const actualFirstPrompt = userMessages[0]?.text?.slice(0, 200)

  if (!indexEntry) {
    return {
      sessionId,
      filePath,
      passed: true, // Missing from index is OK
      hasIndex: true,
      actualMessageCount: actualCount,
      errors,
    }
  }

  const indexCount = indexEntry.messageCount ?? 0
  const countDiscrepancy = Math.abs(indexCount - actualCount)

  if (countDiscrepancy > 5) {
    errors.push(`Message count mismatch: index=${indexCount}, actual=${actualCount} (diff=${countDiscrepancy})`)
  }

  const firstPromptMatch = !indexEntry.firstPrompt ||
    !actualFirstPrompt ||
    actualFirstPrompt.includes(indexEntry.firstPrompt.slice(0, 50)) ||
    indexEntry.firstPrompt.includes(actualFirstPrompt.slice(0, 50))

  return {
    sessionId,
    filePath,
    passed: errors.length === 0,
    hasIndex: true,
    indexMessageCount: indexCount,
    actualMessageCount: actualCount,
    countDiscrepancy,
    indexFirstPrompt: indexEntry.firstPrompt?.slice(0, 100),
    actualFirstPrompt: actualFirstPrompt?.slice(0, 100),
    firstPromptMatch,
    errors,
  }
}
