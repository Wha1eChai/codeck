/**
 * Script 06: Conversation flow structure — turns, depth, branches.
 * Outputs: src/analysis/output/06-conversation-flow.json
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'
import { buildChain, countTurns } from '../core/chain-builder.js'

interface ConversationFlowResult {
  scannedAt: string
  totalSessions: number
  turnDistribution: { p50: number; p90: number; p99: number; max: number }
  depthDistribution: { p50: number; p90: number; p99: number; max: number }
  branchDistribution: { p50: number; p90: number; max: number }
  sidechainStats: {
    sessionsWithSidechain: number
    totalSidechainMessages: number
    avgSidechainMessagesPerSession: number
  }
  mainlineMessageTypes: Record<string, number>
}

function maxDepth(nodes: Map<string, { children: string[] }>, roots: string[]): number {
  let max = 0
  const stack: Array<{ uuid: string; depth: number }> = roots.map((r) => ({
    uuid: r,
    depth: 1,
  }))
  while (stack.length > 0) {
    const { uuid, depth } = stack.pop()!
    max = Math.max(max, depth)
    const node = nodes.get(uuid)
    if (node) {
      for (const child of node.children) {
        stack.push({ uuid: child, depth: depth + 1 })
      }
    }
  }
  return max
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  const turnCounts: number[] = []
  const depths: number[] = []
  const branchCounts: number[] = []
  let totalSessions = 0
  let sessionsWithSidechain = 0
  let totalSidechainMessages = 0
  const mainlineTypeDist: Record<string, number> = {}
  let fileCount = 0

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const files = readdirSync(dirPath, { withFileTypes: true })
      .filter((f) => f.isFile() && extname(f.name) === '.jsonl')
      .map((f) => join(dirPath, f.name))

    for (const filePath of files) {
      fileCount++
      totalSessions++
      if (fileCount % 50 === 0) {
        process.stdout.write(`\r  Processing ${fileCount}...`)
      }

      const messages = []
      for await (const { entry, lineNo } of readJsonlFile(filePath)) {
        const classified = classifyEntry(entry, lineNo)
        messages.push(...classified)
      }

      const chain = buildChain(messages)
      const turns = countTurns(chain)
      turnCounts.push(turns)

      const depth = maxDepth(chain.nodes, chain.roots)
      depths.push(depth)
      branchCounts.push(chain.branchPoints.length)

      // Sidechain stats
      const sidechainMsgs = messages.filter((m) => m.isSidechain)
      if (sidechainMsgs.length > 0) {
        sessionsWithSidechain++
        totalSidechainMessages += sidechainMsgs.length
      }

      // Mainline message type distribution
      for (const uuid of chain.mainTimeline) {
        const node = chain.nodes.get(uuid)
        if (node) {
          mainlineTypeDist[node.type] = (mainlineTypeDist[node.type] ?? 0) + 1
        }
      }
    }
  }

  process.stdout.write('\n')

  const percentile = (arr: number[], pct: number) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = Math.floor(sorted.length * pct)
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0
  }

  const result: ConversationFlowResult = {
    scannedAt: new Date().toISOString(),
    totalSessions,
    turnDistribution: {
      p50: percentile(turnCounts, 0.5),
      p90: percentile(turnCounts, 0.9),
      p99: percentile(turnCounts, 0.99),
      max: Math.max(...turnCounts, 0),
    },
    depthDistribution: {
      p50: percentile(depths, 0.5),
      p90: percentile(depths, 0.9),
      p99: percentile(depths, 0.99),
      max: Math.max(...depths, 0),
    },
    branchDistribution: {
      p50: percentile(branchCounts, 0.5),
      p90: percentile(branchCounts, 0.9),
      max: Math.max(...branchCounts, 0),
    },
    sidechainStats: {
      sessionsWithSidechain,
      totalSidechainMessages,
      avgSidechainMessagesPerSession:
        sessionsWithSidechain > 0
          ? Math.round(totalSidechainMessages / sessionsWithSidechain)
          : 0,
    },
    mainlineMessageTypes: Object.fromEntries(
      Object.entries(mainlineTypeDist).sort(([, a], [, b]) => b - a),
    ),
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '06-conversation-flow.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Conversation Flow Analysis ===')
  console.log(`Total sessions: ${totalSessions}`)
  console.log(`Turns  p50=${result.turnDistribution.p50}  p90=${result.turnDistribution.p90}  max=${result.turnDistribution.max}`)
  console.log(`Depth  p50=${result.depthDistribution.p50}  p90=${result.depthDistribution.p90}  max=${result.depthDistribution.max}`)
  console.log(`Branches  p50=${result.branchDistribution.p50}  p90=${result.branchDistribution.p90}  max=${result.branchDistribution.max}`)
  console.log(`Sessions with sidechain: ${sessionsWithSidechain}`)
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
