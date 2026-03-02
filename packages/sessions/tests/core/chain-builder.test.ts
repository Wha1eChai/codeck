import { describe, it, expect } from 'vitest'
import { buildChain, countTurns, getPathToNode } from '../../src/core/chain-builder.js'
import type { ParsedMessage } from '../../src/core/types.js'

function makeMsg(
  uuid: string,
  parentUuid: string | null,
  role: ParsedMessage['role'],
  type: ParsedMessage['type'] = 'text',
): ParsedMessage {
  return {
    uuid,
    parentUuid,
    sessionId: 'test-session',
    type,
    role,
    timestamp: Date.now(),
    isSidechain: false,
    lineNumber: 1,
  }
}

describe('buildChain', () => {
  it('builds a simple linear chain', () => {
    const messages: ParsedMessage[] = [
      makeMsg('msg-1', null, 'user'),
      makeMsg('msg-2', 'msg-1', 'assistant'),
      makeMsg('msg-3', 'msg-2', 'user'),
      makeMsg('msg-4', 'msg-3', 'assistant'),
    ]

    const chain = buildChain(messages)
    expect(chain.nodes.size).toBe(4)
    expect(chain.roots).toContain('msg-1')
    expect(chain.mainTimeline).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4'])
    expect(chain.branchPoints).toHaveLength(0)
  })

  it('detects branch points', () => {
    const messages: ParsedMessage[] = [
      makeMsg('root', null, 'user'),
      makeMsg('branch-a', 'root', 'assistant'),
      makeMsg('branch-b', 'root', 'assistant'),
    ]

    const chain = buildChain(messages)
    expect(chain.branchPoints).toContain('root')
  })

  it('handles orphaned nodes as roots', () => {
    const messages: ParsedMessage[] = [
      makeMsg('orphan', 'nonexistent-parent', 'user'),
    ]

    const chain = buildChain(messages)
    expect(chain.roots).toContain('orphan')
  })

  it('excludes sidechain messages from main timeline', () => {
    const messages: ParsedMessage[] = [
      makeMsg('main-1', null, 'user'),
      makeMsg('main-2', 'main-1', 'assistant'),
      {
        ...makeMsg('sidechain-1', 'main-1', 'user'),
        isSidechain: true,
      },
    ]

    const chain = buildChain(messages)
    expect(chain.mainTimeline).toContain('main-1')
    expect(chain.mainTimeline).toContain('main-2')
    expect(chain.mainTimeline).not.toContain('sidechain-1')
  })

  it('handles empty input', () => {
    const chain = buildChain([])
    expect(chain.nodes.size).toBe(0)
    expect(chain.roots).toHaveLength(0)
    expect(chain.mainTimeline).toHaveLength(0)
  })
})

describe('countTurns', () => {
  it('counts user→assistant pairs as turns', () => {
    const messages: ParsedMessage[] = [
      makeMsg('u1', null, 'user'),
      makeMsg('a1', 'u1', 'assistant'),
      makeMsg('u2', 'a1', 'user'),
      makeMsg('a2', 'u2', 'assistant'),
    ]
    const chain = buildChain(messages)
    expect(countTurns(chain)).toBe(2)
  })

  it('returns 0 for empty chain', () => {
    const chain = buildChain([])
    expect(countTurns(chain)).toBe(0)
  })
})

describe('getPathToNode', () => {
  it('returns path from root to target', () => {
    const messages: ParsedMessage[] = [
      makeMsg('root', null, 'user'),
      makeMsg('child', 'root', 'assistant'),
      makeMsg('grandchild', 'child', 'user'),
    ]
    const chain = buildChain(messages)
    const path = getPathToNode(chain.nodes, 'grandchild')
    expect(path).toEqual(['root', 'child', 'grandchild'])
  })
})
