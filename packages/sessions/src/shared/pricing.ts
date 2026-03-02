/**
 * Model pricing table (USD per million tokens).
 * Updated 2025-05.
 */

export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheWritePerMillion: number
  cacheReadPerMillion: number
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // Claude 4 models
  'claude-opus-4-5': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-opus-4-6': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-sonnet-4-5': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-haiku-4-5': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheWritePerMillion: 1,
    cacheReadPerMillion: 0.08,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheWritePerMillion: 1,
    cacheReadPerMillion: 0.08,
  },
  // Claude 3 models
  'claude-opus-3-5': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-sonnet-3-5': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-3-7': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-haiku-3-5': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheWritePerMillion: 1,
    cacheReadPerMillion: 0.08,
  },
  // Vertex AI variants (thinking)
  'claude-opus-4-5-thinking': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-sonnet-4-5-thinking': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Google Gemini models (via Vertex AI / Google AI)
  // Pricing as of 2025-05 for Gemini 2.x series
  'gemini-2.0-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.025,
  },
  'gemini-2.0-flash-lite': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0,
  },
  'gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.31,
  },
  'gemini-2.5-flash': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.0375,
  },
  // Legacy / observed in data
  'gemini-3-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.025,
  },
  'gemini-3-pro-high': {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.31,
  },
}

// Default fallback for unknown models
const DEFAULT_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheWritePerMillion: 3.75,
  cacheReadPerMillion: 0.3,
}

export function getPricing(model: string): ModelPricing {
  if (!model) return DEFAULT_PRICING

  // Normalize: remove vendor prefix like "vrtx_" etc.
  const normalized = model
    .toLowerCase()
    .replace(/^(vrtx_|aws_|bedrock_)/, '')
    .replace(/_thinking$/, '')

  // Exact match first
  if (PRICING_TABLE[normalized]) return PRICING_TABLE[normalized]

  // Prefix match (e.g., "claude-opus-4-5-20250514" → "claude-opus-4-5")
  for (const [key, pricing] of Object.entries(PRICING_TABLE)) {
    if (normalized.startsWith(key)) return pricing
  }

  // Family heuristic
  if (normalized.includes('opus')) return PRICING_TABLE['claude-opus-4-5']!
  if (normalized.includes('sonnet')) return PRICING_TABLE['claude-sonnet-4-5']!
  if (normalized.includes('haiku')) return PRICING_TABLE['claude-haiku-4-5']!
  // Gemini family fallback (much cheaper than Claude)
  if (normalized.includes('gemini')) return PRICING_TABLE['gemini-2.0-flash']!

  return DEFAULT_PRICING
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export function estimateCost(usage: TokenUsage, model: string): number {
  const pricing = getPricing(model)
  const M = 1_000_000

  return (
    (usage.inputTokens * pricing.inputPerMillion) / M +
    (usage.outputTokens * pricing.outputPerMillion) / M +
    (usage.cacheCreationInputTokens * pricing.cacheWritePerMillion) / M +
    (usage.cacheReadInputTokens * pricing.cacheReadPerMillion) / M
  )
}
