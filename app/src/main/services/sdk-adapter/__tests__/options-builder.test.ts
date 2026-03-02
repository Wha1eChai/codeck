import { describe, it, expect } from 'vitest'
import { buildQueryArgs } from '../options-builder'
import type { SDKCanUseToolCallback } from '../sdk-types'

const mockCanUseTool: SDKCanUseToolCallback = async () => ({
  behavior: 'allow' as const,
  toolUseID: 'test',
})

describe('buildQueryArgs', () => {
  it('should build query args with all params', () => {
    const abortController = new AbortController()
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        sessionId: 'session_123',
        permissionMode: 'default',
      },
      mockCanUseTool,
      abortController,
    )

    expect(result.prompt).toBe('Hello')
    expect(result.options.cwd).toBe('/project')
    expect(result.options.sessionId).toBe('session_123')
    expect(result.options.includePartialMessages).toBe(true)
    expect(result.options.permissionMode).toBe('default')
    expect(result.options.canUseTool).toBe(mockCanUseTool)
    expect(result.options.abortController).toBe(abortController)
    expect(result.options.persistSession).toBe(true)
  })

  it('should handle missing sessionId', () => {
    const abortController = new AbortController()
    const result = buildQueryArgs(
      {
        prompt: 'Test',
        cwd: '/tmp',
        permissionMode: 'plan',
      },
      mockCanUseTool,
      abortController,
    )

    expect(result.options.sessionId).toBeUndefined()
    expect(result.options.includePartialMessages).toBe(true)
    expect(result.options.permissionMode).toBe('plan')
  })

  it('should pass env to options', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-test', CLAUDE_CODE_GIT_BASH_PATH: '/bin/bash' }
    const result = buildQueryArgs(
      {
        prompt: 'Test',
        cwd: '/tmp',
        permissionMode: 'default',
        env,
      },
      mockCanUseTool,
      new AbortController(),
    )

    expect(result.options.env).toEqual(env)
    expect(result.options.persistSession).toBe(true)
  })

  it('should pass resume separately when provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Follow up',
        cwd: '/tmp',
        sessionId: 'ui-session-1',
        permissionMode: 'default',
        resume: 'sdk-session-abc',
      },
      mockCanUseTool,
      new AbortController(),
    )

    expect(result.options.resume).toBe('sdk-session-abc')
    expect(result.options.sessionId).toBeUndefined()
  })

  it('should fall back to sessionId when no resume', () => {
    const result = buildQueryArgs(
      {
        prompt: 'First msg',
        cwd: '/tmp',
        sessionId: 'ui-session-1',
        permissionMode: 'default',
      },
      mockCanUseTool,
      new AbortController(),
    )

    expect(result.options.sessionId).toBe('ui-session-1')
  })

  it('should pass through all permission modes', () => {
    const modes = [
      'default',
      'plan',
      'acceptEdits',
      'dontAsk',
      'bypassPermissions',
    ] as const

    for (const mode of modes) {
      const result = buildQueryArgs(
        { prompt: 'x', cwd: '/', permissionMode: mode },
        mockCanUseTool,
        new AbortController(),
      )
      expect(result.options.permissionMode).toBe(mode)
    }
  })
})

describe('buildQueryArgs — ExecutionOptions (Phase 2)', () => {
  it('should pass model when provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'claude-opus-4-5' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.model).toBe('claude-opus-4-5')
  })

  it('should pass maxTurns when provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { maxTurns: 10 },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.maxTurns).toBe(10)
  })

  it('should pass maxBudgetUsd when provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { maxBudgetUsd: 5.00 },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.maxBudgetUsd).toBe(5.00)
  })

  it('should pass thinking adaptive config', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { thinking: { type: 'adaptive' } },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.thinking).toEqual({ type: 'adaptive' })
  })

  it('should pass thinking enabled with budget', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { thinking: { type: 'enabled', budgetTokens: 8000 } },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.thinking).toEqual({ type: 'enabled', budgetTokens: 8000 })
  })

  it('should pass thinking disabled', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { thinking: { type: 'disabled' } },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.thinking).toEqual({ type: 'disabled' })
  })

  it('should not include thinking key when undefined', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'claude-opus-4-5' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect('thinking' in result.options).toBe(false)
  })

  it('should pass all execution options together', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: {
          model: 'claude-opus-4-5',
          maxTurns: 5,
          maxBudgetUsd: 2.50,
          thinking: { type: 'enabled', budgetTokens: 4000 },
        },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.model).toBe('claude-opus-4-5')
    expect(result.options.maxTurns).toBe(5)
    expect(result.options.maxBudgetUsd).toBe(2.50)
    expect(result.options.thinking).toEqual({ type: 'enabled', budgetTokens: 4000 })
  })

  it('should not include execution option keys when executionOptions is undefined', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect('model' in result.options).toBe(false)
    expect('maxTurns' in result.options).toBe(false)
    expect('maxBudgetUsd' in result.options).toBe(false)
    expect('thinking' in result.options).toBe(false)
  })

  it('should not include keys for undefined execution option fields', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'claude-opus-4-5' }, // only model set
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.model).toBe('claude-opus-4-5')
    expect('maxTurns' in result.options).toBe(false)
    expect('maxBudgetUsd' in result.options).toBe(false)
    expect('thinking' in result.options).toBe(false)
  })

  it('should pass effort when provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { effort: 'high' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.effort).toBe('high')
  })

  it('should not include effort key when undefined', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'sonnet' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect('effort' in result.options).toBe(false)
  })

  it('should resolve model alias via modelAliases', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'opus' },
        modelAliases: { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.model).toBe('claude-opus-4-6')
  })

  it('should pass through full model ID when not in aliases', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        executionOptions: { model: 'claude-custom-model' },
        modelAliases: { opus: 'claude-opus-4-6' },
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.model).toBe('claude-custom-model')
  })
})

describe('buildQueryArgs — settingSources (Phase 3)', () => {
  it('should always include settingSources with user and project', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.settingSources).toEqual(['user', 'project'])
  })
})

describe('buildQueryArgs — MCP Servers (Phase 3)', () => {
  it('should include mcpServers when non-empty', () => {
    const mcpServers = {
      'my-server': { command: 'npx', args: ['-y', 'my-mcp'] },
    }
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default', mcpServers },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.mcpServers).toEqual(mcpServers)
  })

  it('should not include mcpServers when empty object', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default', mcpServers: {} },
      mockCanUseTool,
      new AbortController(),
    )
    expect('mcpServers' in result.options).toBe(false)
  })

  it('should not include mcpServers when undefined', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect('mcpServers' in result.options).toBe(false)
  })
})

describe('buildQueryArgs — Agents (Phase 4)', () => {
  it('should include agents when non-empty', () => {
    const agents = {
      'my-agent': { description: 'Test agent', prompt: 'Do stuff' },
    }
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default', agents },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.agents).toEqual(agents)
  })

  it('should not include agents when empty object', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default', agents: {} },
      mockCanUseTool,
      new AbortController(),
    )
    expect('agents' in result.options).toBe(false)
  })

  it('should not include agents when undefined', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect('agents' in result.options).toBe(false)
  })
})

describe('buildQueryArgs — Structured Output', () => {
  it('should include outputFormat when provided', () => {
    const outputFormat = { type: 'json_schema' as const, schema: { name: 'test', schema: { type: 'object' } } }
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default', outputFormat },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.outputFormat).toEqual(outputFormat)
  })

  it('should not include outputFormat when undefined', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect('outputFormat' in result.options).toBe(false)
  })
})

describe('buildQueryArgs — Stop Hooks (Phase 3)', () => {
  it('should include Stop hooks when onStopLog provided', () => {
    const result = buildQueryArgs(
      {
        prompt: 'Hello',
        cwd: '/project',
        permissionMode: 'default',
        onStopLog: () => {},
      },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.hooks).toBeDefined()
    expect(result.options.hooks?.Stop).toBeDefined()
    expect(result.options.hooks!.Stop!.length).toBeGreaterThan(0)
  })

  it('should not include Stop hooks when onStopLog not provided', () => {
    const result = buildQueryArgs(
      { prompt: 'Hello', cwd: '/project', permissionMode: 'default' },
      mockCanUseTool,
      new AbortController(),
    )
    expect(result.options.hooks).toBeUndefined()
  })
})
