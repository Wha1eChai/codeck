import type { LanguageModel } from 'ai'

export interface ModelRef {
  readonly providerId: string
  readonly modelId: string
}

export interface ModelCapabilities {
  readonly contextWindow: number
  readonly maxOutputTokens: number
  readonly supportsThinking: boolean
  readonly supportsImages: boolean
  readonly costPer1kInput: number
  readonly costPer1kOutput: number
}

export interface ResolvedModel {
  readonly ref: ModelRef
  readonly capabilities: ModelCapabilities
  readonly languageModel: LanguageModel
}

export interface ProviderFactory {
  readonly id: string
  resolveModel(modelId: string): ResolvedModel
  listModels(): readonly ModelRef[]
}
