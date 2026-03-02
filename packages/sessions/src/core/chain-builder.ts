import type { ParsedMessage, ChainNode, MessageChain } from './types.js'

/**
 * Build a message chain tree from a list of parsed messages.
 * Two-pass algorithm: first build node map, then assemble children.
 */
export function buildChain(messages: ParsedMessage[]): MessageChain {
  const nodes = new Map<string, ChainNode>()

  // Pass 1: build lightweight node map
  for (const msg of messages) {
    if (!msg.uuid) continue
    nodes.set(msg.uuid, {
      uuid: msg.uuid,
      parentUuid: msg.parentUuid,
      type: msg.type,
      role: msg.role,
      timestamp: msg.timestamp,
      isSidechain: msg.isSidechain,
      children: [],
    })
  }

  // Pass 2: wire up parent→children relationships
  const roots: string[] = []
  for (const node of nodes.values()) {
    if (node.parentUuid == null) {
      roots.push(node.uuid)
    } else {
      const parent = nodes.get(node.parentUuid)
      if (parent) {
        parent.children.push(node.uuid)
      } else {
        // Orphaned node — parent is in a different session (continuation/cross-session ref).
        // Treat as a root; it will form a segment of the timeline.
        roots.push(node.uuid)
      }
    }
  }

  // Find branch points (nodes with multiple children)
  const branchPoints = Array.from(nodes.values())
    .filter((n) => n.children.length > 1)
    .map((n) => n.uuid)

  // Build main timeline (non-sidechain BFS in timestamp order)
  const mainTimeline = buildMainTimeline(nodes, roots)

  return { nodes, roots, mainTimeline, branchPoints }
}

function buildMainTimeline(
  nodes: Map<string, ChainNode>,
  roots: string[],
): string[] {
  const timeline: string[] = []
  const visited = new Set<string>()

  // Sort roots by timestamp
  const sortedRoots = [...roots].sort((a, b) => {
    const ta = nodes.get(a)?.timestamp ?? 0
    const tb = nodes.get(b)?.timestamp ?? 0
    return ta - tb
  })

  // BFS, prefer non-sidechain nodes, sort children by timestamp
  const queue: string[] = [...sortedRoots]

  while (queue.length > 0) {
    const uuid = queue.shift()!
    if (visited.has(uuid)) continue
    visited.add(uuid)

    const node = nodes.get(uuid)
    if (!node) continue

    if (!node.isSidechain) {
      timeline.push(uuid)
    }

    // Sort children by timestamp before adding to queue
    const sortedChildren = [...node.children].sort((a, b) => {
      const ta = nodes.get(a)?.timestamp ?? 0
      const tb = nodes.get(b)?.timestamp ?? 0
      return ta - tb
    })

    queue.push(...sortedChildren)
  }

  return timeline
}

/**
 * Get the linear conversation path from root to a specific node.
 */
export function getPathToNode(
  nodes: Map<string, ChainNode>,
  targetUuid: string,
): string[] {
  const path: string[] = []
  let current: string | null = targetUuid

  while (current != null) {
    const node = nodes.get(current)
    if (!node) break
    path.unshift(current)
    current = node.parentUuid
  }

  return path
}

/**
 * Count unique conversation turns (user→assistant pairs) in the main timeline.
 * Skips system/compact/meta nodes that don't count as turns.
 */
export function countTurns(chain: MessageChain): number {
  let turns = 0
  let awaitingAssistant = false

  for (const uuid of chain.mainTimeline) {
    const node = chain.nodes.get(uuid)
    if (!node) continue

    // Skip non-conversational nodes
    if (node.type === 'compact' || node.type === 'system' || node.role === 'system') {
      continue
    }

    if (node.role === 'user' && !awaitingAssistant) {
      awaitingAssistant = true
    } else if (node.role === 'assistant' && awaitingAssistant) {
      turns++
      awaitingAssistant = false
    }
  }

  return turns
}

/**
 * Count the number of context compaction events in the chain.
 */
export function countCompacts(chain: MessageChain): number {
  return Array.from(chain.nodes.values()).filter((n) => n.type === 'compact').length
}
