import { describe, it, expect, vi } from 'vitest'
import {
  assessToolRisk,
  summarizeToolInput,
  toPermissionRequest,
  toSDKPermissionResult,
  buildPermissionDecisionKey,
  createPermissionHandler,
} from '../permission-adapter'
import type { SDKCanUseToolOptions } from '../sdk-types'

const mockSdkOptions: SDKCanUseToolOptions = {
  signal: new AbortController().signal,
  toolUseID: 'toolu_01ABC',
  agentID: 'agent_001',
  suggestions: [{ type: 'allow' }],
  decisionReason: 'File read is safe',
}

describe('assessToolRisk', () => {
  it('should classify read-only tools as low risk', () => {
    expect(assessToolRisk('Read')).toBe('low')
    expect(assessToolRisk('Glob')).toBe('low')
    expect(assessToolRisk('Grep')).toBe('low')
    expect(assessToolRisk('WebSearch')).toBe('low')
    expect(assessToolRisk('WebFetch')).toBe('low')
  })

  it('should classify edit tools as medium risk', () => {
    expect(assessToolRisk('Edit')).toBe('medium')
    expect(assessToolRisk('Write')).toBe('medium')
    expect(assessToolRisk('NotebookEdit')).toBe('medium')
  })

  it('should classify unknown tools as high risk', () => {
    expect(assessToolRisk('Bash')).toBe('high')
    expect(assessToolRisk('Task')).toBe('high')
    expect(assessToolRisk('SomeNewTool')).toBe('high')
  })
})

describe('summarizeToolInput', () => {
  it('should summarize Read tool', () => {
    expect(summarizeToolInput('Read', { file_path: '/src/index.ts' })).toBe('/src/index.ts')
  })

  it('should summarize Bash tool with truncation', () => {
    const longCommand = 'a'.repeat(200)
    const result = summarizeToolInput('Bash', { command: longCommand })
    expect(result.length).toBe(120)
  })

  it('should summarize Glob tool', () => {
    expect(summarizeToolInput('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts')
  })

  it('should JSON stringify unknown tools', () => {
    const result = summarizeToolInput('CustomTool', { key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  it('should handle missing fields', () => {
    expect(summarizeToolInput('Read', {})).toBe('')
    expect(summarizeToolInput('Bash', {})).toBe('')
  })
})

describe('toPermissionRequest', () => {
  it('should convert SDK params to PermissionRequest', () => {
    const result = toPermissionRequest(
      'Read',
      { file_path: '/src/index.ts' },
      mockSdkOptions,
    )

    expect(result).toMatchObject({
      toolName: 'Read',
      toolInput: { file_path: '/src/index.ts' },
      description: 'Read: /src/index.ts',
      risk: 'low',
      toolUseId: 'toolu_01ABC',
      agentId: 'agent_001',
      suggestions: [{ type: 'allow' }],
      decisionReason: 'File read is safe',
    })
    expect(result.id).toBeDefined()
  })
})

describe('toSDKPermissionResult', () => {
  it('should convert allowed response', () => {
    const result = toSDKPermissionResult(
      { requestId: 'r1', allowed: true },
      'toolu_01ABC',
    )
    expect(result).toEqual({ behavior: 'allow', toolUseID: 'toolu_01ABC' })
  })

  it('should convert denied response with reason', () => {
    const result = toSDKPermissionResult(
      { requestId: 'r1', allowed: false, reason: 'Too risky' },
      'toolu_01ABC',
    )
    expect(result).toEqual({
      behavior: 'deny',
      message: 'Too risky',
      toolUseID: 'toolu_01ABC',
    })
  })

  it('should use default message when no reason provided', () => {
    const result = toSDKPermissionResult(
      { requestId: 'r1', allowed: false },
      'toolu_01ABC',
    )
    expect(result).toEqual({
      behavior: 'deny',
      message: 'User denied permission',
      toolUseID: 'toolu_01ABC',
    })
  })
})

describe('buildPermissionDecisionKey', () => {
  it('should generate stable keys for equivalent nested payloads', () => {
    const left = buildPermissionDecisionKey('Read', {
      file_path: '/src/index.ts',
      context: { line: 1, column: 2 },
    })
    const right = buildPermissionDecisionKey('Read', {
      context: { column: 2, line: 1 },
      file_path: '/src/index.ts',
    })

    expect(left).toBe(right)
  })
})

describe('createPermissionHandler', () => {
  it('should send request to renderer and wait for response', async () => {
    const sendToRenderer = vi.fn()
    const onStatusChange = vi.fn()
    const waitForResponse = vi.fn().mockResolvedValue({
      requestId: 'r1',
      allowed: true,
    })

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange,
      isWindowDestroyed: () => false,
    })

    const result = await handler('Read', { file_path: '/test' }, mockSdkOptions)

    expect(sendToRenderer).toHaveBeenCalledOnce()
    expect(onStatusChange).toHaveBeenCalledWith('waiting_permission')
    expect(onStatusChange).toHaveBeenCalledWith('streaming')
    expect(result).toEqual({ behavior: 'allow', toolUseID: 'toolu_01ABC' })
  })

  it('should deny immediately if window is destroyed', async () => {
    const handler = createPermissionHandler({
      sendToRenderer: vi.fn(),
      waitForResponse: vi.fn(),
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => true,
    })

    const result = await handler('Bash', { command: 'rm -rf /' }, mockSdkOptions)

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Window closed',
      toolUseID: 'toolu_01ABC',
    })
  })

  it('should handle denied response', async () => {
    const handler = createPermissionHandler({
      sendToRenderer: vi.fn(),
      waitForResponse: vi.fn().mockResolvedValue({
        requestId: 'r1',
        allowed: false,
        reason: 'Not safe',
      }),
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => false,
    })

    const result = await handler('Bash', { command: 'rm -rf /' }, mockSdkOptions)

    expect(result).toEqual({
      behavior: 'deny',
      message: 'Not safe',
      toolUseID: 'toolu_01ABC',
    })
  })

  it('should reuse remembered decision in the same session store (low-risk: tool scope)', async () => {
    const sendToRenderer = vi.fn()
    const waitForResponse = vi.fn().mockResolvedValue({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
    })
    const onStatusChange = vi.fn()
    const decisionStore = new Map<string, { allowed: boolean; reason?: string }>()

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange,
      isWindowDestroyed: () => false,
      decisionStore: {
        get: (key) => decisionStore.get(key),
        set: (key, decision) => decisionStore.set(key, decision),
      },
    })

    // Read is low-risk → defaults to 'tool' scope → same tool, different inputs both skip prompt
    const firstResult = await handler('Read', { file_path: '/test' }, mockSdkOptions)
    const secondResult = await handler('Read', { file_path: '/other' }, mockSdkOptions)

    expect(firstResult).toEqual({ behavior: 'allow', toolUseID: 'toolu_01ABC' })
    expect(secondResult).toEqual({ behavior: 'allow', toolUseID: 'toolu_01ABC' })
    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    expect(waitForResponse).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledTimes(2)
  })

  it('should still prompt when Bash input differs (high-risk: input scope)', async () => {
    const sendToRenderer = vi.fn()
    const waitForResponse = vi
      .fn()
      .mockResolvedValue({ requestId: 'r1', allowed: true, rememberForSession: true })
    const decisionStore = new Map<string, { allowed: boolean; reason?: string }>()

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => false,
      decisionStore: {
        get: (key) => decisionStore.get(key),
        set: (key, decision) => decisionStore.set(key, decision),
      },
    })

    // Bash is high-risk → defaults to 'input' scope → different commands must each prompt
    await handler('Bash', { command: 'ls /tmp' }, mockSdkOptions)
    await handler('Bash', { command: 'rm -rf /tmp/foo' }, mockSdkOptions)

    expect(sendToRenderer).toHaveBeenCalledTimes(2)
    expect(waitForResponse).toHaveBeenCalledTimes(2)
  })

  it('should skip prompt for same Bash command after remembering (input scope)', async () => {
    const sendToRenderer = vi.fn()
    const waitForResponse = vi.fn().mockResolvedValue({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
    })
    const decisionStore = new Map<string, { allowed: boolean; reason?: string }>()

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => false,
      decisionStore: {
        get: (key) => decisionStore.get(key),
        set: (key, decision) => decisionStore.set(key, decision),
      },
    })

    // Same Bash command twice → second call should be skipped
    await handler('Bash', { command: 'npm run build' }, mockSdkOptions)
    await handler('Bash', { command: 'npm run build' }, mockSdkOptions)

    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    expect(waitForResponse).toHaveBeenCalledTimes(1)
  })

  it('should skip prompt for different Bash inputs when explicit tool scope is set', async () => {
    const sendToRenderer = vi.fn()
    const waitForResponse = vi.fn().mockResolvedValue({
      requestId: 'r1',
      allowed: true,
      rememberForSession: true,
      rememberScope: 'tool', // user explicitly chose tool-level scope
    })
    const decisionStore = new Map<string, { allowed: boolean; reason?: string }>()

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => false,
      decisionStore: {
        get: (key) => decisionStore.get(key),
        set: (key, decision) => decisionStore.set(key, decision),
      },
    })

    // Explicit 'tool' scope overrides the high-risk default
    await handler('Bash', { command: 'ls /tmp' }, mockSdkOptions)
    await handler('Bash', { command: 'rm -rf /tmp/foo' }, mockSdkOptions)

    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    expect(waitForResponse).toHaveBeenCalledTimes(1)
  })

  it('should reuse remembered deny decision in the same session store', async () => {
    const sendToRenderer = vi.fn()
    const waitForResponse = vi.fn().mockResolvedValue({
      requestId: 'r1',
      allowed: false,
      reason: 'Denied once',
      rememberForSession: true,
    })
    const decisionStore = new Map<string, { allowed: boolean; reason?: string }>()

    const handler = createPermissionHandler({
      sendToRenderer,
      waitForResponse,
      onStatusChange: vi.fn(),
      isWindowDestroyed: () => false,
      decisionStore: {
        get: (key) => decisionStore.get(key),
        set: (key, decision) => decisionStore.set(key, decision),
      },
    })

    const firstResult = await handler('Bash', { command: 'rm -rf /tmp' }, mockSdkOptions)
    const secondResult = await handler('Bash', { command: 'rm -rf /tmp' }, mockSdkOptions)

    expect(firstResult).toEqual({
      behavior: 'deny',
      message: 'Denied once',
      toolUseID: 'toolu_01ABC',
    })
    expect(secondResult).toEqual({
      behavior: 'deny',
      message: 'Denied once',
      toolUseID: 'toolu_01ABC',
    })
    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    expect(waitForResponse).toHaveBeenCalledTimes(1)
  })
})
