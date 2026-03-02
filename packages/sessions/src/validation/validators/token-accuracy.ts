import { readAllJsonlEntries } from '../../core/jsonl-reader.js'
import { classifyEntry } from '../../core/classifier.js'
import { aggregateTokens } from '../../core/token-aggregator.js'
import type { RawUsage } from '../../core/types.js'

export interface TokenAccuracyResult {
  sessionId: string
  filePath: string
  passed: boolean
  lineByLineTotal: { inputTokens: number; outputTokens: number }
  aggregatedTotal: { inputTokens: number; outputTokens: number }
  discrepancy: { inputTokens: number; outputTokens: number }
  errors: string[]
}

/**
 * Validate token statistics by independently summing from raw lines
 * and comparing with the aggregator result.
 */
export async function validateTokenAccuracy(
  sessionId: string,
  filePath: string,
): Promise<TokenAccuracyResult> {
  const errors: string[] = []
  const allEntries = await readAllJsonlEntries(filePath)

  // Independent line-by-line extraction
  let lineInput = 0
  let lineOutput = 0

  for (const { entry } of allEntries) {
    if (entry.type !== 'assistant') continue
    const msg = entry.message
    if (!msg || typeof msg !== 'object') continue
    const usage = msg.usage as RawUsage | undefined
    if (!usage) continue
    lineInput += usage.input_tokens ?? 0
    lineOutput += usage.output_tokens ?? 0
  }

  // Aggregator result
  const messages = allEntries.flatMap(({ entry, lineNo }) => classifyEntry(entry, lineNo))
  const agg = aggregateTokens(messages)

  const discInput = Math.abs(lineInput - agg.totalInputTokens)
  const discOutput = Math.abs(lineOutput - agg.totalOutputTokens)

  if (discInput !== 0) {
    errors.push(`Input token discrepancy: line-by-line=${lineInput}, aggregated=${agg.totalInputTokens}`)
  }
  if (discOutput !== 0) {
    errors.push(`Output token discrepancy: line-by-line=${lineOutput}, aggregated=${agg.totalOutputTokens}`)
  }

  return {
    sessionId,
    filePath,
    passed: errors.length === 0,
    lineByLineTotal: { inputTokens: lineInput, outputTokens: lineOutput },
    aggregatedTotal: { inputTokens: agg.totalInputTokens, outputTokens: agg.totalOutputTokens },
    discrepancy: { inputTokens: discInput, outputTokens: discOutput },
    errors,
  }
}
