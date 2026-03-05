import { describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/anthropic', () => {
  const mockLanguageModel = {
    specificationVersion: 'v1',
    provider: 'anthropic',
    modelId: 'mock',
    defaultObjectGenerationMode: 'tool',
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }

  return {
    createAnthropic: vi.fn(() => {
      return vi.fn(() => mockLanguageModel)
    }),
  }
})

import { createAnthropicProvider } from '../anthropic.js'
import { createModelRegistry } from '../model-registry.js'

describe('createAnthropicProvider', () => {
  it('resolves the latest opus model', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    const resolved = provider.resolveModel('claude-opus-4-6')

    expect(resolved.ref).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-opus-4-6',
    })
    expect(resolved.capabilities.maxOutputTokens).toBe(128000)
    expect(resolved.capabilities.supportsThinking).toBe(true)
    expect(resolved.capabilities.costPer1kInput).toBe(0.005)
    expect(resolved.languageModel).toBeDefined()
  })

  it('resolves the latest sonnet model', () => {
    const provider = createAnthropicProvider()
    const resolved = provider.resolveModel('claude-sonnet-4-6')

    expect(resolved.capabilities.maxOutputTokens).toBe(64000)
    expect(resolved.capabilities.costPer1kInput).toBe(0.003)
  })

  it('resolves haiku model with correct capabilities', () => {
    const provider = createAnthropicProvider()
    const resolved = provider.resolveModel('claude-haiku-4-5-20251001')

    expect(resolved.capabilities.maxOutputTokens).toBe(64000)
    expect(resolved.capabilities.supportsThinking).toBe(true)
    expect(resolved.capabilities.costPer1kInput).toBe(0.001)
  })

  it('resolves legacy sonnet-4 model', () => {
    const provider = createAnthropicProvider()
    const resolved = provider.resolveModel('claude-sonnet-4-20250514')

    expect(resolved.ref.modelId).toBe('claude-sonnet-4-20250514')
    expect(resolved.capabilities.contextWindow).toBe(200000)
  })

  it('resolves legacy opus-4 model', () => {
    const provider = createAnthropicProvider()
    const resolved = provider.resolveModel('claude-opus-4-20250514')

    expect(resolved.ref.modelId).toBe('claude-opus-4-20250514')
    expect(resolved.capabilities.costPer1kInput).toBe(0.015)
  })

  describe('short alias resolution', () => {
    it('resolves "sonnet" to claude-sonnet-4-6', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('sonnet')

      expect(resolved.ref.modelId).toBe('claude-sonnet-4-6')
    })

    it('resolves "opus" to claude-opus-4-6', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('opus')

      expect(resolved.ref.modelId).toBe('claude-opus-4-6')
    })

    it('resolves "haiku" to claude-haiku-4-5-20251001', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('haiku')

      expect(resolved.ref.modelId).toBe('claude-haiku-4-5-20251001')
    })
  })

  describe('official API alias resolution', () => {
    it('resolves claude-haiku-4-5 alias', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-haiku-4-5')

      expect(resolved.ref.modelId).toBe('claude-haiku-4-5-20251001')
    })

    it('resolves claude-sonnet-4-5 alias', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-sonnet-4-5')

      expect(resolved.ref.modelId).toBe('claude-sonnet-4-5-20250929')
    })

    it('resolves claude-opus-4-5 alias', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-opus-4-5')

      expect(resolved.ref.modelId).toBe('claude-opus-4-5-20251101')
    })

    it('resolves claude-sonnet-4-0 legacy alias', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-sonnet-4-0')

      expect(resolved.ref.modelId).toBe('claude-sonnet-4-20250514')
    })

    it('resolves claude-opus-4-0 legacy alias', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-opus-4-0')

      expect(resolved.ref.modelId).toBe('claude-opus-4-20250514')
    })
  })

  describe('convenience alias resolution', () => {
    it('resolves claude-sonnet-4 to latest sonnet', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-sonnet-4')

      expect(resolved.ref.modelId).toBe('claude-sonnet-4-6')
    })

    it('resolves claude-opus-4 to latest opus', () => {
      const provider = createAnthropicProvider()
      const resolved = provider.resolveModel('claude-opus-4')

      expect(resolved.ref.modelId).toBe('claude-opus-4-6')
    })
  })

  it('returns default capabilities for unknown model IDs instead of throwing', () => {
    const provider = createAnthropicProvider()
    const resolved = provider.resolveModel('some-future-model-2027')

    // Should not throw — returns default capabilities
    expect(resolved.ref.modelId).toBe('some-future-model-2027')
    expect(resolved.capabilities.contextWindow).toBe(200000)
    expect(resolved.languageModel).toBeDefined()
  })

  it('lists all known canonical models', () => {
    const provider = createAnthropicProvider()
    const models = provider.listModels()

    expect(models.length).toBeGreaterThanOrEqual(7)
    expect(models.every((m) => m.providerId === 'anthropic')).toBe(true)

    const modelIds = models.map((m) => m.modelId)
    expect(modelIds).toContain('claude-opus-4-6')
    expect(modelIds).toContain('claude-sonnet-4-6')
    expect(modelIds).toContain('claude-haiku-4-5-20251001')
  })

  it('has provider id "anthropic"', () => {
    const provider = createAnthropicProvider()
    expect(provider.id).toBe('anthropic')
  })
})

describe('createModelRegistry', () => {
  it('registers and retrieves a provider', () => {
    const registry = createModelRegistry()
    const provider = createAnthropicProvider()

    registry.registerProvider(provider)

    expect(registry.getProvider('anthropic')).toBe(provider)
  })

  it('returns undefined for unregistered provider', () => {
    const registry = createModelRegistry()

    expect(registry.getProvider('openai')).toBeUndefined()
  })

  it('throws on duplicate provider registration', () => {
    const registry = createModelRegistry()
    const provider = createAnthropicProvider()

    registry.registerProvider(provider)

    expect(() => registry.registerProvider(provider)).toThrow(
      'Provider "anthropic" is already registered',
    )
  })

  it('resolves a model through the registry', () => {
    const registry = createModelRegistry()
    registry.registerProvider(createAnthropicProvider())

    const resolved = registry.resolveModel('anthropic', 'claude-sonnet-4-6')

    expect(resolved.ref.providerId).toBe('anthropic')
    expect(resolved.ref.modelId).toBe('claude-sonnet-4-6')
    expect(resolved.capabilities.contextWindow).toBe(200000)
  })

  it('resolves aliases through the registry', () => {
    const registry = createModelRegistry()
    registry.registerProvider(createAnthropicProvider())

    const resolved = registry.resolveModel('anthropic', 'sonnet')

    expect(resolved.ref.modelId).toBe('claude-sonnet-4-6')
  })

  it('throws when resolving from unknown provider', () => {
    const registry = createModelRegistry()

    expect(() => registry.resolveModel('openai', 'gpt-4o')).toThrow(
      'Unknown provider "openai"',
    )
  })

  it('lists all models across providers', () => {
    const registry = createModelRegistry()
    registry.registerProvider(createAnthropicProvider())

    const allModels = registry.listAllModels()

    expect(allModels.length).toBeGreaterThanOrEqual(7)
    expect(allModels.every((m) => m.providerId === 'anthropic')).toBe(true)
  })

  it('lists models from multiple providers', () => {
    const registry = createModelRegistry()
    registry.registerProvider(createAnthropicProvider())

    // Register a minimal fake provider
    registry.registerProvider({
      id: 'test-provider',
      resolveModel: () => {
        throw new Error('not implemented')
      },
      listModels: () => [{ providerId: 'test-provider', modelId: 'test-model' }],
    })

    const allModels = registry.listAllModels()

    expect(allModels.length).toBeGreaterThanOrEqual(8)
    expect(allModels.some((m) => m.providerId === 'test-provider')).toBe(true)
  })
})
