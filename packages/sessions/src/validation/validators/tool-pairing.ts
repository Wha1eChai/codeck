import { readAllJsonlEntries } from '../../core/jsonl-reader.js'
import { classifyEntry } from '../../core/classifier.js'
import { pairToolCalls } from '../../core/tool-tracker.js'

export interface ToolPairingResult {
  sessionId: string
  filePath: string
  passed: boolean
  totalToolUses: number
  totalToolResults: number
  pairedCount: number
  unpairedUses: number
  unpairedResults: number
  pairingRate: number
  errors: string[]
}

/**
 * Validate tool_use ↔ tool_result pairing.
 * Allows tail unpaired (in-progress tool calls at session end).
 */
export async function validateToolPairing(
  sessionId: string,
  filePath: string,
): Promise<ToolPairingResult> {
  const errors: string[] = []
  const allEntries = await readAllJsonlEntries(filePath)
  const messages = allEntries.flatMap(({ entry, lineNo }) => classifyEntry(entry, lineNo))

  const toolUses = messages.filter((m) => m.type === 'tool_use')
  const toolResults = messages.filter((m) => m.type === 'tool_result')

  const { paired, unpairedUses, unpairedResults } = pairToolCalls(messages)

  const pairingRate = toolUses.length > 0 ? paired.length / toolUses.length : 1

  // Only flag if there are unpaired RESULTS (tool_result without matching tool_use)
  // Unpaired uses at tail are OK (session ended mid-tool)
  if (unpairedResults.length > 0) {
    errors.push(`${unpairedResults.length} tool_result(s) have no matching tool_use`)
  }

  // Warn if pairing rate is very low
  if (toolUses.length > 5 && pairingRate < 0.8) {
    errors.push(`Low pairing rate: ${(pairingRate * 100).toFixed(1)}% (${paired.length}/${toolUses.length})`)
  }

  return {
    sessionId,
    filePath,
    passed: errors.length === 0,
    totalToolUses: toolUses.length,
    totalToolResults: toolResults.length,
    pairedCount: paired.length,
    unpairedUses: unpairedUses.length,
    unpairedResults: unpairedResults.length,
    pairingRate,
    errors,
  }
}
