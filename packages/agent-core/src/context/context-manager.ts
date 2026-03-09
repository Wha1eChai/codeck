import type { CoreMessage } from 'ai'
import { estimateTokens, estimateMessageTokens } from './token-estimator.js'

export interface ContextBudget {
  /** Total context window in tokens (e.g. 200_000). */
  readonly contextWindow: number
  /** Tokens reserved for model output (e.g. 64_000). */
  readonly maxOutputTokens: number
  /** Pre-computed system prompt token count. */
  readonly systemPromptTokens: number
}

/**
 * Compress a tool result string by keeping head + tail when it exceeds maxChars.
 * Preserves first 70% and last 20% of the budget, inserting a truncation notice.
 */
export function compressToolResult(result: string, maxChars = 8000): string {
  if (result.length <= maxChars) return result

  const headSize = Math.floor(maxChars * 0.7)
  const tailSize = Math.floor(maxChars * 0.2)
  const head = result.slice(0, headSize)
  const tail = result.slice(-tailSize)
  const dropped = result.length - headSize - tailSize
  return `${head}\n\n... [${dropped} chars truncated] ...\n\n${tail}`
}

function compressMessageToolResults(message: CoreMessage): CoreMessage {
  if (message.role !== 'tool' || !Array.isArray(message.content)) return message

  const compressed = message.content.map((part) => {
    if ('result' in part && typeof part.result === 'string' && part.result.length > 8000) {
      return { ...part, result: compressToolResult(part.result) }
    }
    return part
  })

  return { ...message, content: compressed } as CoreMessage
}

/** Minimum number of recent messages to always keep (user + assistant pairs). */
const MIN_TAIL_MESSAGES = 6

/**
 * Prune messages to fit within context budget.
 *
 * Strategy:
 * 1. Compress large tool results (>8000 chars) in all messages
 * 2. Always keep the first user message (establishes conversation context)
 * 3. Always keep the last MIN_TAIL_MESSAGES messages (recent context)
 * 4. Drop middle messages (oldest first) when over budget
 */
export function pruneMessages(
  messages: readonly CoreMessage[],
  budget: ContextBudget,
): CoreMessage[] {
  const available = budget.contextWindow - budget.maxOutputTokens - budget.systemPromptTokens
  if (available <= 0) return [...messages] // budget misconfigured, pass through

  // Step 1: compress tool results in all messages
  const compressed = messages.map(compressMessageToolResults)

  // Step 2: check if already within budget
  const totalEstimate = compressed.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
  if (totalEstimate <= available) return compressed

  // Step 3: separate into pinned head, droppable middle, pinned tail
  const tailCount = Math.min(MIN_TAIL_MESSAGES, compressed.length)
  const headCount = compressed.length > tailCount ? 1 : 0 // keep first message if we have more than tail

  const head = compressed.slice(0, headCount)
  const tail = compressed.slice(compressed.length - tailCount)
  const middle = compressed.slice(headCount, compressed.length - tailCount)

  // Calculate pinned token budget
  const headTokens = head.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
  const tailTokens = tail.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
  let remainingBudget = available - headTokens - tailTokens

  // Step 4: fill middle from newest to oldest (keep most recent middle messages)
  const keptMiddle: CoreMessage[] = []
  for (let i = middle.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(middle[i]!)
    if (msgTokens <= remainingBudget) {
      keptMiddle.unshift(middle[i]!)
      remainingBudget -= msgTokens
    }
    // else: drop this message
  }

  return [...head, ...keptMiddle, ...tail]
}

/** Convenience: compute budget from known values. */
export function createContextBudget(
  contextWindow: number,
  maxOutputTokens: number,
  systemPrompt: string,
): ContextBudget {
  return {
    contextWindow,
    maxOutputTokens,
    systemPromptTokens: estimateTokens(systemPrompt),
  }
}
