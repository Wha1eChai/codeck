import { describe, it, expect } from 'vitest'
import { resolveModelAlias } from '../model-alias-resolver'
import { DEFAULT_MODEL_ALIASES } from '@common/defaults'

describe('resolveModelAlias', () => {
  it('should resolve known alias to full model ID', () => {
    expect(resolveModelAlias('sonnet', DEFAULT_MODEL_ALIASES)).toBe('claude-sonnet-4-6')
    expect(resolveModelAlias('opus', DEFAULT_MODEL_ALIASES)).toBe('claude-opus-4-6')
    expect(resolveModelAlias('haiku', DEFAULT_MODEL_ALIASES)).toBe('claude-haiku-4-5-20251001')
  })

  it('should pass through full model IDs unchanged', () => {
    expect(resolveModelAlias('claude-sonnet-4-6', DEFAULT_MODEL_ALIASES)).toBe('claude-sonnet-4-6')
    expect(resolveModelAlias('claude-opus-4-6', DEFAULT_MODEL_ALIASES)).toBe('claude-opus-4-6')
    expect(resolveModelAlias('some-custom-model', DEFAULT_MODEL_ALIASES)).toBe('some-custom-model')
  })

  it('should return undefined when input is undefined', () => {
    expect(resolveModelAlias(undefined, DEFAULT_MODEL_ALIASES)).toBeUndefined()
  })

  it('should return undefined when input is empty string', () => {
    expect(resolveModelAlias('', DEFAULT_MODEL_ALIASES)).toBeUndefined()
  })

  it('should use DEFAULT_MODEL_ALIASES when aliases param is undefined', () => {
    expect(resolveModelAlias('sonnet', undefined)).toBe('claude-sonnet-4-6')
    expect(resolveModelAlias('opus', undefined)).toBe('claude-opus-4-6')
    expect(resolveModelAlias('haiku', undefined)).toBe('claude-haiku-4-5-20251001')
  })

  it('should resolve with custom alias mappings', () => {
    const customAliases = {
      sonnet: 'claude-sonnet-custom-version',
      opus: 'claude-opus-custom-version',
    }
    expect(resolveModelAlias('sonnet', customAliases)).toBe('claude-sonnet-custom-version')
    expect(resolveModelAlias('opus', customAliases)).toBe('claude-opus-custom-version')
    // Unknown alias in custom map → pass through
    expect(resolveModelAlias('haiku', customAliases)).toBe('haiku')
  })

  it('should pass through unknown aliases when not in mapping', () => {
    expect(resolveModelAlias('unknown-alias', DEFAULT_MODEL_ALIASES)).toBe('unknown-alias')
  })
})
