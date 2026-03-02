import { readAllJsonlEntries } from '../../core/jsonl-reader.js'
import { classifyEntry } from '../../core/classifier.js'
import { buildChain } from '../../core/chain-builder.js'

export interface ChainIntegrityResult {
  sessionId: string
  filePath: string
  passed: boolean
  orphanedNodes: number
  /** Count of parentUuid refs pointing to messages in other sessions (normal for continuations). */
  crossSessionRefs: number
  missingParents: string[]
  isolatedSubgraphs: number
  errors: string[]
}

/**
 * Validate message chain integrity:
 * - Every parentUuid references an existing message (or null for root)
 * - No isolated subgraphs
 */
export async function validateChainIntegrity(
  sessionId: string,
  filePath: string,
): Promise<ChainIntegrityResult> {
  const errors: string[] = []
  const allEntries = await readAllJsonlEntries(filePath)
  const messages = allEntries.flatMap(({ entry, lineNo }) => classifyEntry(entry, lineNo))

  const chain = buildChain(messages)
  const missingParents: string[] = []

  for (const node of chain.nodes.values()) {
    if (node.parentUuid != null && !chain.nodes.has(node.parentUuid)) {
      missingParents.push(`${node.uuid} → ${node.parentUuid}`)
    }
  }

  // Count isolated subgraphs (nodes not reachable from any root)
  const reachable = new Set<string>()
  const queue = [...chain.roots]
  while (queue.length > 0) {
    const uuid = queue.pop()!
    if (reachable.has(uuid)) continue
    reachable.add(uuid)
    const node = chain.nodes.get(uuid)
    if (node) queue.push(...node.children)
  }

  const isolatedNodes = Array.from(chain.nodes.keys()).filter((id) => !reachable.has(id))
  const isolatedSubgraphs = countSubgraphs(isolatedNodes, chain.nodes)

  // NOTE: Cross-session parentUuid references are expected and normal in Claude Code.
  // Sessions can be continued from previous ones, so some parentUuids will reference
  // messages from other session files. We only fail if more than 50% of messages
  // have missing parents (truly broken file), or if there are circular references.
  const missingParentRate = chain.nodes.size > 0
    ? missingParents.length / chain.nodes.size
    : 0

  if (missingParentRate > 0.5) {
    errors.push(
      `High missing parent rate: ${missingParents.length}/${chain.nodes.size} (${(missingParentRate * 100).toFixed(0)}%) — likely corrupt file`,
    )
  }
  if (isolatedSubgraphs > 10) {
    errors.push(`${isolatedSubgraphs} isolated subgraphs — unexpected structure`)
  }

  return {
    sessionId,
    filePath,
    passed: errors.length === 0,
    orphanedNodes: isolatedNodes.length,
    crossSessionRefs: missingParents.length, // Expected: cross-session parentUuid refs
    missingParents: missingParents.slice(0, 5),
    isolatedSubgraphs,
    errors,
  }
}

function countSubgraphs(
  nodeIds: string[],
  nodes: Map<string, { children: string[]; parentUuid: string | null }>,
): number {
  if (nodeIds.length === 0) return 0
  const remaining = new Set(nodeIds)
  let count = 0

  for (const startId of nodeIds) {
    if (!remaining.has(startId)) continue
    count++
    // BFS to mark all connected nodes
    const queue = [startId]
    while (queue.length > 0) {
      const id = queue.pop()!
      remaining.delete(id)
      const node = nodes.get(id)
      if (node) {
        for (const child of node.children) {
          if (remaining.has(child)) queue.push(child)
        }
      }
    }
  }

  return count
}
