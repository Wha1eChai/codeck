import { describe, it, expect, vi } from 'vitest'
import { createTeamTools, TEAM_TOOL_NAMES } from '../team.js'
import type { ToolContext, TeamBridge } from '../types.js'

function createMockContext(teamBridge?: TeamBridge): ToolContext {
  return {
    sessionId: 'test-session',
    cwd: '/tmp/test',
    abortSignal: new AbortController().signal,
    ...(teamBridge ? { teamBridge } : {}),
  }
}

function createMockBridge(overrides?: Partial<TeamBridge>): TeamBridge {
  return {
    spawnChild: vi.fn().mockResolvedValue({ sessionId: 'child-1' }),
    sendToChild: vi.fn().mockResolvedValue(undefined),
    getChildStatus: vi.fn().mockResolvedValue({ status: 'idle' as const }),
    ...overrides,
  }
}

describe('Team tools', () => {
  it('TEAM_TOOL_NAMES contains SpawnSession, SendMessage, GetSessionStatus', () => {
    expect(TEAM_TOOL_NAMES).toEqual(['SpawnSession', 'SendMessage', 'GetSessionStatus'])
  })

  it('createTeamTools returns 3 tool definitions', () => {
    const tools = createTeamTools()
    expect(tools).toHaveLength(3)
    expect(tools.map(t => t.name)).toEqual([...TEAM_TOOL_NAMES])
  })

  it('SpawnSession has required parameters', () => {
    const tools = createTeamTools()
    const spawn = tools.find(t => t.name === 'SpawnSession')!
    const shape = spawn.parameters.shape
    expect(shape).toHaveProperty('role')
    expect(shape).toHaveProperty('prompt')
  })

  it('SpawnSession has optional parameters', () => {
    const tools = createTeamTools()
    const spawn = tools.find(t => t.name === 'SpawnSession')!
    const shape = spawn.parameters.shape
    expect(shape).toHaveProperty('useWorktree')
    expect(shape).toHaveProperty('model')
  })

  it('SendMessage has sessionId and message parameters', () => {
    const tools = createTeamTools()
    const send = tools.find(t => t.name === 'SendMessage')!
    const shape = send.parameters.shape
    expect(shape).toHaveProperty('sessionId')
    expect(shape).toHaveProperty('message')
  })

  it('GetSessionStatus has sessionId parameter', () => {
    const tools = createTeamTools()
    const status = tools.find(t => t.name === 'GetSessionStatus')!
    const shape = status.parameters.shape
    expect(shape).toHaveProperty('sessionId')
  })
})

describe('SpawnSession execute', () => {
  it('returns error when teamBridge is not available', async () => {
    const tools = createTeamTools()
    const spawn = tools.find(t => t.name === 'SpawnSession')!
    const ctx = createMockContext()
    const result = await spawn.execute({ role: 'coder', prompt: 'do stuff' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('not available')
  })

  it('calls teamBridge.spawnChild and returns sessionId', async () => {
    const bridge = createMockBridge()
    const tools = createTeamTools()
    const spawn = tools.find(t => t.name === 'SpawnSession')!
    const ctx = createMockContext(bridge)
    const result = await spawn.execute({ role: 'coder', prompt: 'implement auth' }, ctx)
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.output)).toEqual({ sessionId: 'child-1' })
    expect(bridge.spawnChild).toHaveBeenCalledWith({
      role: 'coder',
      prompt: 'implement auth',
      useWorktree: undefined,
      model: undefined,
    })
  })

  it('returns error when spawnChild throws', async () => {
    const bridge = createMockBridge({
      spawnChild: vi.fn().mockRejectedValue(new Error('spawn failed')),
    })
    const tools = createTeamTools()
    const spawn = tools.find(t => t.name === 'SpawnSession')!
    const ctx = createMockContext(bridge)
    const result = await spawn.execute({ role: 'coder', prompt: 'do stuff' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('spawn failed')
  })
})

describe('SendMessage execute', () => {
  it('returns error when teamBridge is not available', async () => {
    const tools = createTeamTools()
    const send = tools.find(t => t.name === 'SendMessage')!
    const ctx = createMockContext()
    const result = await send.execute({ sessionId: 'child-1', message: 'hello' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('not available')
  })

  it('calls teamBridge.sendToChild successfully', async () => {
    const bridge = createMockBridge()
    const tools = createTeamTools()
    const send = tools.find(t => t.name === 'SendMessage')!
    const ctx = createMockContext(bridge)
    const result = await send.execute({ sessionId: 'child-1', message: 'do more' }, ctx)
    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('successfully')
    expect(bridge.sendToChild).toHaveBeenCalledWith('child-1', 'do more')
  })

  it('returns error when sendToChild throws', async () => {
    const bridge = createMockBridge({
      sendToChild: vi.fn().mockRejectedValue(new Error('session not found')),
    })
    const tools = createTeamTools()
    const send = tools.find(t => t.name === 'SendMessage')!
    const ctx = createMockContext(bridge)
    const result = await send.execute({ sessionId: 'bad-id', message: 'hello' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('session not found')
  })
})

describe('GetSessionStatus execute', () => {
  it('returns error when teamBridge is not available', async () => {
    const tools = createTeamTools()
    const status = tools.find(t => t.name === 'GetSessionStatus')!
    const ctx = createMockContext()
    const result = await status.execute({ sessionId: 'child-1' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('not available')
  })

  it('calls teamBridge.getChildStatus and returns JSON', async () => {
    const bridge = createMockBridge({
      getChildStatus: vi.fn().mockResolvedValue({
        status: 'streaming',
        lastMessage: 'Working on it...',
      }),
    })
    const tools = createTeamTools()
    const status = tools.find(t => t.name === 'GetSessionStatus')!
    const ctx = createMockContext(bridge)
    const result = await status.execute({ sessionId: 'child-1' }, ctx)
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(result.output)
    expect(parsed.status).toBe('streaming')
    expect(parsed.lastMessage).toBe('Working on it...')
  })

  it('returns error when getChildStatus throws', async () => {
    const bridge = createMockBridge({
      getChildStatus: vi.fn().mockRejectedValue(new Error('internal error')),
    })
    const tools = createTeamTools()
    const status = tools.find(t => t.name === 'GetSessionStatus')!
    const ctx = createMockContext(bridge)
    const result = await status.execute({ sessionId: 'child-1' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('internal error')
  })
})
