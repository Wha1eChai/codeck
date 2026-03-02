import React from 'react'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useSessionStore } from '../../stores/session-store'
import { useSettingsStore } from '../../stores/settings-store'

// Pricing per 1M tokens (USD) — indexed by model family prefix
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku': { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1.00 },
}
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet']

function getPricing(model?: string) {
  if (!model) return DEFAULT_PRICING
  const key = Object.keys(MODEL_PRICING).find(k => model.toLowerCase().includes(k.replace('claude-', '')))
  return key ? MODEL_PRICING[key] : DEFAULT_PRICING
}

export const TokenBar: React.FC = () => {
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const usage = useTokenUsage(currentSessionId)
  const model = useSettingsStore(s => s.executionOptions.model)
  const pricing = getPricing(model)

  if (!currentSessionId) return null

  const estimatedCost = (
    (usage.inputTokens * pricing.input) +
    (usage.outputTokens * pricing.output) +
    (usage.cacheReadTokens * pricing.cacheRead) +
    (usage.cacheWriteTokens * pricing.cacheWrite)
  ) / 1_000_000

  const cost = usage.costUsd !== undefined ? usage.costUsd : estimatedCost

  return (
    <div className="flex items-center justify-between px-4 py-1 text-xs text-muted-foreground border-t bg-muted/20 select-none">
      <div className="flex items-center gap-4">
        <span title="Input Tokens">↑ {usage.inputTokens.toLocaleString()}</span>
        <span title="Output Tokens">↓ {usage.outputTokens.toLocaleString()}</span>
        {(usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0) && (
          <span title="Context Caching">
            Cache: {usage.cacheReadTokens.toLocaleString()} R / {usage.cacheWriteTokens.toLocaleString()} W
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {model && <span className="opacity-60">{model}</span>}
        <span>Est. Cost: ${cost.toFixed(4)}</span>
      </div>
    </div>
  )
}
