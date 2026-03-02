import { estimateCost } from '../shared/pricing.js'
import type { ParsedMessage, ParsedUsage } from './types.js'

export interface TokenAggregate {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  estimatedCostUsd: number
  byModel: Record<string, ModelTokens>
}

export interface ModelTokens {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
  messageCount: number
}

export function aggregateTokens(messages: ParsedMessage[]): TokenAggregate {
  const byModel: Record<string, ModelTokens> = {}

  // Deduplicate by UUID: in streaming mode, the same assistant turn may appear
  // multiple times (intermediate + final). Keep only the entry with usage attached
  // (which corresponds to the final streamed message for that turn).
  const seenUuids = new Set<string>()

  for (const msg of messages) {
    if (!msg.usage || msg.role !== 'assistant') continue
    // Skip duplicate UUIDs — keep first occurrence (which carries the aggregated usage)
    if (msg.uuid && seenUuids.has(msg.uuid)) continue
    if (msg.uuid) seenUuids.add(msg.uuid)

    const model = msg.model ?? 'unknown'
    const usage = msg.usage

    if (!byModel[model]) {
      byModel[model] = {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        estimatedCostUsd: 0,
        messageCount: 0,
      }
    }

    const entry = byModel[model]!
    entry.inputTokens += usage.inputTokens
    entry.outputTokens += usage.outputTokens
    entry.cacheCreationTokens += usage.cacheCreationInputTokens
    entry.cacheReadTokens += usage.cacheReadInputTokens
    entry.estimatedCostUsd += estimateCost({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
    }, model)
    entry.messageCount++
  }

  // Sum totals
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheCreationTokens = 0
  let totalCacheReadTokens = 0
  let estimatedCostUsd = 0

  for (const m of Object.values(byModel)) {
    totalInputTokens += m.inputTokens
    totalOutputTokens += m.outputTokens
    totalCacheCreationTokens += m.cacheCreationTokens
    totalCacheReadTokens += m.cacheReadTokens
    estimatedCostUsd += m.estimatedCostUsd
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    estimatedCostUsd,
    byModel,
  }
}

/**
 * Extract usage from a single message's usage field.
 */
export function extractUsage(msg: ParsedMessage): ParsedUsage | undefined {
  return msg.usage
}

/**
 * Sum two usage objects immutably.
 */
export function addUsage(a: ParsedUsage, b: ParsedUsage): ParsedUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  }
}

export const EMPTY_USAGE: ParsedUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
}
