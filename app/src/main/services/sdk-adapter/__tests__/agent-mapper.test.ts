import { describe, it, expect } from 'vitest'
import { mapAgentsToSDKDefinitions } from '../agent-mapper'
import type { AgentFile } from '@codeck/config'

function makeAgent(overrides: Partial<AgentFile> = {}): AgentFile {
  return {
    filename: 'test-agent.md',
    filePath: '/home/user/.claude/agents/test-agent.md',
    scope: 'global',
    pluginId: undefined,
    name: 'test-agent',
    frontmatter: {
      description: 'A test agent',
      model: 'sonnet',
      'allowed-tools': ['Read', 'Grep'],
    },
    body: 'You are a test agent. Do testing.',
    ...overrides,
  }
}

describe('mapAgentsToSDKDefinitions', () => {
  it('maps full agent correctly', () => {
    const result = mapAgentsToSDKDefinitions([makeAgent()])
    expect(result).toEqual({
      'test-agent': {
        description: 'A test agent',
        prompt: 'You are a test agent. Do testing.',
        tools: ['Read', 'Grep'],
        model: 'sonnet',
      },
    })
  })

  it('uses name as Record key', () => {
    const agents = [
      makeAgent({ name: 'alpha' }),
      makeAgent({ name: 'beta' }),
    ]
    const result = mapAgentsToSDKDefinitions(agents)
    expect(Object.keys(result)).toEqual(['alpha', 'beta'])
  })

  it('falls back description to "Agent: <name>"', () => {
    const agent = makeAgent({
      name: 'my-agent',
      frontmatter: { 'allowed-tools': [] },
    })
    const result = mapAgentsToSDKDefinitions([agent])
    expect(result['my-agent'].description).toBe('Agent: my-agent')
  })

  it('converts string tools to array', () => {
    const agent = makeAgent({
      frontmatter: {
        description: 'test',
        'allowed-tools': 'Read, Grep, Bash',
      },
    })
    const result = mapAgentsToSDKDefinitions([agent])
    expect(result['test-agent'].tools).toEqual(['Read', 'Grep', 'Bash'])
  })

  it('omits tools when empty', () => {
    const agent = makeAgent({
      frontmatter: { description: 'test', 'allowed-tools': [] },
    })
    const result = mapAgentsToSDKDefinitions([agent])
    expect('tools' in result['test-agent']).toBe(false)
  })

  it('omits tools when undefined', () => {
    const agent = makeAgent({
      frontmatter: { description: 'test' },
    })
    const result = mapAgentsToSDKDefinitions([agent])
    expect('tools' in result['test-agent']).toBe(false)
  })

  it('omits model when not specified', () => {
    const agent = makeAgent({
      frontmatter: { description: 'test' },
    })
    const result = mapAgentsToSDKDefinitions([agent])
    expect('model' in result['test-agent']).toBe(false)
  })

  it('returns empty record for empty input', () => {
    const result = mapAgentsToSDKDefinitions([])
    expect(result).toEqual({})
  })
})
