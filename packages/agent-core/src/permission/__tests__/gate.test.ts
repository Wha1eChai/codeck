import { describe, it, expect, vi } from 'vitest'
import { createPermissionGate } from '../gate.js'
import { createPermissionMemoryStore, buildInputKey, buildToolKey } from '../memory-store.js'
import type { PermissionCallback } from '../types.js'

function createTestGate(callback: PermissionCallback) {
  const store = createPermissionMemoryStore()
  const gate = createPermissionGate({ store, onPermissionRequest: callback })
  return { gate, store }
}

describe('PermissionGate', () => {
  it('should call callback when no cached decision exists', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
    })
    const { gate } = createTestGate(callback)

    const result = await gate.check('Bash', { command: 'echo hello' })

    expect(callback).toHaveBeenCalledOnce()
    expect(result.allowed).toBe(true)

    const request = callback.mock.calls[0]![0]
    expect(request.toolName).toBe('Bash')
    expect(request.risk).toBe('high')
    expect(request.description).toContain('echo hello')
  })

  it('should cache tool-level decision for low-risk tools', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
      rememberForSession: true,
    })
    const { gate } = createTestGate(callback)

    // First call — prompts user
    await gate.check('Read', { file_path: '/tmp/a.txt' })
    expect(callback).toHaveBeenCalledOnce()

    // Second call with DIFFERENT input — should hit tool-level cache
    const result = await gate.check('Read', { file_path: '/tmp/b.txt' })
    expect(callback).toHaveBeenCalledOnce() // still only one call
    expect(result.allowed).toBe(true)
    expect(result.requestId).toContain('cached:tool:Read')
  })

  it('should cache input-level decision for high-risk tools', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
      rememberForSession: true,
    })
    const { gate } = createTestGate(callback)

    // First call — prompts user
    await gate.check('Bash', { command: 'rm -rf /' })
    expect(callback).toHaveBeenCalledOnce()

    // Same input — should hit input-level cache
    const result = await gate.check('Bash', { command: 'rm -rf /' })
    expect(callback).toHaveBeenCalledOnce()
    expect(result.allowed).toBe(true)

    // Different input — should prompt again
    await gate.check('Bash', { command: 'echo safe' })
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should respect explicit rememberScope override', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
      rememberForSession: true,
      rememberScope: 'tool', // override default 'input' for high-risk
    })
    const { gate } = createTestGate(callback)

    await gate.check('Bash', { command: 'echo a' })
    expect(callback).toHaveBeenCalledOnce()

    // Different input — should still hit cache because scope is 'tool'
    const result = await gate.check('Bash', { command: 'echo b' })
    expect(callback).toHaveBeenCalledOnce()
    expect(result.allowed).toBe(true)
  })

  it('should handle deny decisions', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: false,
      reason: 'Too dangerous',
      rememberForSession: true,
    })
    const { gate } = createTestGate(callback)

    const result = await gate.check('Bash', { command: 'rm -rf /' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Too dangerous')

    // Same input — should get cached deny
    const cached = await gate.check('Bash', { command: 'rm -rf /' })
    expect(cached.allowed).toBe(false)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('should not cache when rememberForSession is false', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
    })
    const { gate } = createTestGate(callback)

    await gate.check('Bash', { command: 'echo a' })
    await gate.check('Bash', { command: 'echo a' })

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should clear cache', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
      rememberForSession: true,
    })
    const { gate } = createTestGate(callback)

    await gate.check('Read', { file_path: '/tmp/a.txt' })
    gate.clearCache()
    await gate.check('Read', { file_path: '/tmp/a.txt' })

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('should classify medium-risk tools correctly', async () => {
    const callback = vi.fn<PermissionCallback>().mockResolvedValue({
      requestId: 'resp-1',
      allowed: true,
      rememberForSession: true,
    })
    const { gate } = createTestGate(callback)

    await gate.check('Edit', { file_path: '/tmp/a.txt', old_string: 'a', new_string: 'b' })
    expect(callback).toHaveBeenCalledOnce()

    const request = callback.mock.calls[0]![0]
    expect(request.risk).toBe('medium')

    // Medium risk defaults to tool scope
    const result = await gate.check('Edit', { file_path: '/tmp/b.txt', old_string: 'x', new_string: 'y' })
    expect(callback).toHaveBeenCalledOnce() // cached at tool level
    expect(result.allowed).toBe(true)
  })
})

describe('PermissionMemoryStore', () => {
  it('should store and retrieve decisions', () => {
    const store = createPermissionMemoryStore()
    store.set('key1', { allowed: true, scope: 'input' })
    expect(store.get('key1')).toEqual({ allowed: true, scope: 'input' })
    expect(store.get('unknown')).toBeUndefined()
  })

  it('should track size', () => {
    const store = createPermissionMemoryStore()
    expect(store.size()).toBe(0)
    store.set('k1', { allowed: true, scope: 'tool' })
    expect(store.size()).toBe(1)
  })

  it('should clear all decisions', () => {
    const store = createPermissionMemoryStore()
    store.set('k1', { allowed: true, scope: 'tool' })
    store.set('k2', { allowed: false, scope: 'input' })
    store.clear()
    expect(store.size()).toBe(0)
  })
})

describe('Key builders', () => {
  it('buildInputKey should produce stable keys for same input', () => {
    const key1 = buildInputKey('Bash', { command: 'echo a', timeout: 5000 })
    const key2 = buildInputKey('Bash', { timeout: 5000, command: 'echo a' })
    expect(key1).toBe(key2) // order-independent
  })

  it('buildToolKey should produce simple key', () => {
    expect(buildToolKey('Read')).toBe('tool:Read')
  })
})
