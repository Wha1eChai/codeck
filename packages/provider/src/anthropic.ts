import { createAnthropic } from '@ai-sdk/anthropic'
import type { ModelCapabilities, ModelRef, ProviderFactory, ResolvedModel } from './types.js'

const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  'claude-opus-4-20250514': {
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  'claude-sonnet-4-20250514': {
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsThinking: true,
    supportsImages: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-haiku-4-5-20251001': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsThinking: false,
    supportsImages: true,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
  },
}

const MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4-6': 'claude-opus-4-20250514',
  'claude-opus-4': 'claude-opus-4-20250514',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4': 'claude-haiku-4-5-20251001',
}

const PROVIDER_ID = 'anthropic'

function resolveAlias(modelId: string): string {
  return MODEL_ALIASES[modelId] ?? modelId
}

export function createAnthropicProvider(config?: { apiKey?: string }): ProviderFactory {
  const apiKey = config?.apiKey
  const anthropic = createAnthropic(
    apiKey !== undefined ? { apiKey } : {},
  )

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
      const capabilities = MODEL_CATALOG[canonicalId]

      if (!capabilities) {
        throw new Error(
          `Unknown model "${modelId}" for provider "${PROVIDER_ID}". ` +
            `Available models: ${Object.keys(MODEL_CATALOG).join(', ')}`,
        )
      }

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
