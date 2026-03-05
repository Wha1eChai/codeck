import type { ModelRef, ProviderFactory, ResolvedModel } from './types.js'

export interface ModelRegistry {
  registerProvider(provider: ProviderFactory): void
  getProvider(providerId: string): ProviderFactory | undefined
  resolveModel(providerId: string, modelId: string): ResolvedModel
  listAllModels(): readonly ModelRef[]
}

export function createModelRegistry(): ModelRegistry {
  const providers = new Map<string, ProviderFactory>()

  return {
    registerProvider(provider: ProviderFactory): void {
      if (providers.has(provider.id)) {
        throw new Error(`Provider "${provider.id}" is already registered`)
      }
      providers.set(provider.id, provider)
    },

    getProvider(providerId: string): ProviderFactory | undefined {
      return providers.get(providerId)
    },

    resolveModel(providerId: string, modelId: string): ResolvedModel {
      const provider = providers.get(providerId)
      if (!provider) {
        throw new Error(
          `Unknown provider "${providerId}". ` +
            `Registered providers: ${[...providers.keys()].join(', ') || '(none)'}`,
        )
      }
      return provider.resolveModel(modelId)
    },

    listAllModels(): readonly ModelRef[] {
      const refs: ModelRef[] = []
      for (const provider of providers.values()) {
        refs.push(...provider.listModels())
      }
      return refs
    },
  }
}
