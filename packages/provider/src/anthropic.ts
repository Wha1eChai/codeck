import { createAnthropic } from '@ai-sdk/anthropic'
import type { ModelCapabilities, ModelRef, ProviderFactory, ResolvedModel } from './types.js'

// Model catalog with capabilities metadata.
// IDs sourced from https://platform.claude.com/docs/en/about-claude/models/overview
// Last verified: 2026-03-06
const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  // Latest generation
  'claude-opus-4-6': {
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
  },
  'claude-sonnet-4-6': {
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-haiku-4-5-20251001': {
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
  },
  // Legacy (still available)
  'claude-sonnet-4-5-20250929': {
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-opus-4-5-20251101': {
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
  },
  'claude-sonnet-4-20250514': {
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-opus-4-20250514': {
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
}

const MODEL_ALIASES: Record<string, string> = {
  // Short aliases (used by UI and KernelService defaults)
  'opus': 'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5-20251001',
  // Official API aliases
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-sonnet-4-0': 'claude-sonnet-4-20250514',
  'claude-opus-4-0': 'claude-opus-4-20250514',
  // Convenience aliases
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-opus-4': 'claude-opus-4-6',
  'claude-haiku-4': 'claude-haiku-4-5-20251001',
}

/** Default capabilities for unknown model IDs — conservative estimates. */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  contextWindow: 200000,
  maxOutputTokens: 64000,
  supportsThinking: true,
  supportsImages: true,
  costPer1kInput: 0.003,
  costPer1kOutput: 0.015,
}

const PROVIDER_ID = 'anthropic'

function resolveAlias(modelId: string): string {
  return MODEL_ALIASES[modelId] ?? modelId
}

export function createAnthropicProvider(config?: { apiKey?: string; baseURL?: string }): ProviderFactory {
  const anthropic = createAnthropic({
    ...(config?.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config?.baseURL ? { baseURL: config.baseURL } : {}),
  })

  const allModelRefs: readonly ModelRef[] = Object.keys(MODEL_CATALOG).map(
    (modelId) => ({
      providerId: PROVIDER_ID,
      modelId,
    }),
  )

  return {
    id: PROVIDER_ID,

    resolveModel(modelId: string): ResolvedModel {
      const canonicalId = resolveAlias(modelId)
      // Use known capabilities if available, otherwise use sensible defaults.
      // This allows new model IDs to work without code changes.
      const capabilities = MODEL_CATALOG[canonicalId] ?? DEFAULT_CAPABILITIES

      return {
        ref: { providerId: PROVIDER_ID, modelId: canonicalId },
        capabilities,
        languageModel: anthropic(canonicalId),
      }
    },

    listModels(): readonly ModelRef[] {
      return allModelRefs
    },
  }
}
