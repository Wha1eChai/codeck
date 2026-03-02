/**
 * Script 04: Tool call frequency and pairing analysis.
 * Outputs: src/analysis/output/04-tool-usage.json
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'
import { pairToolCalls, getToolStats } from '../core/tool-tracker.js'
import type { ToolCall } from '../core/types.js'

interface ToolUsageResult {
  scannedAt: string
  totalToolUseMessages: number
  totalToolResultMessages: number
  totalPairedCalls: number
  unpairedUseCount: number
  unpairedResultCount: number
  pairingRate: number
  toolStats: Array<{
    toolName: string
    totalCalls: number
    successCount: number
    failureCount: number
    successRate: number
  }>
  topTools: string[]
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  let totalToolUse = 0
  let totalToolResult = 0
  let totalPaired = 0
  let totalUnpairedUse = 0
  let totalUnpairedResult = 0
  const allPaired: ToolCall[] = []
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
      if (fileCount % 50 === 0) {
        process.stdout.write(`\r  Processing ${fileCount}...`)
      }

      const messages = []
      for await (const { entry, lineNo } of readJsonlFile(filePath)) {
        const classified = classifyEntry(entry, lineNo)
        messages.push(...classified)
      }

      const toolUse = messages.filter((m) => m.type === 'tool_use')
      const toolResult = messages.filter((m) => m.type === 'tool_result')
      totalToolUse += toolUse.length
      totalToolResult += toolResult.length

      const { paired, unpairedUses, unpairedResults } = pairToolCalls(messages)
      totalPaired += paired.length
      totalUnpairedUse += unpairedUses.length
      totalUnpairedResult += unpairedResults.length
      allPaired.push(...paired)
    }
  }

  process.stdout.write('\n')

  const stats = getToolStats(allPaired)
  const toolStatsSorted = Object.values(stats)
    .sort((a, b) => b.totalCalls - a.totalCalls)
    .map((s) => ({
      toolName: s.toolName,
      totalCalls: s.totalCalls,
      successCount: s.successCount,
      failureCount: s.failureCount,
      successRate: s.totalCalls > 0 ? s.successCount / s.totalCalls : 0,
    }))

  const pairingRate = totalToolUse > 0 ? totalPaired / totalToolUse : 0

  const result: ToolUsageResult = {
    scannedAt: new Date().toISOString(),
    totalToolUseMessages: totalToolUse,
    totalToolResultMessages: totalToolResult,
    totalPairedCalls: totalPaired,
    unpairedUseCount: totalUnpairedUse,
    unpairedResultCount: totalUnpairedResult,
    pairingRate,
    toolStats: toolStatsSorted,
    topTools: toolStatsSorted.slice(0, 10).map((s) => s.toolName),
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '04-tool-usage.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Tool Usage Analysis ===')
  console.log(`Total tool_use:     ${totalToolUse.toLocaleString()}`)
  console.log(`Total tool_result:  ${totalToolResult.toLocaleString()}`)
  console.log(`Paired calls:       ${totalPaired.toLocaleString()}`)
  console.log(`Pairing rate:       ${(pairingRate * 100).toFixed(1)}%`)
  console.log('\nTop 10 tools:')
  for (const s of toolStatsSorted.slice(0, 10)) {
    const rate = (s.successRate * 100).toFixed(1)
    console.log(`  ${s.toolName.padEnd(20)} ${String(s.totalCalls).padStart(6)}  (${rate}% success)`)
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
