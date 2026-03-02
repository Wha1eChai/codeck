/**
 * Script 03: Token consumption and cost analysis.
 * Outputs: src/analysis/output/03-token-cost.json
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { decodeProjectDirName } from '../shared/project-decoder.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'
import { aggregateTokens } from '../core/token-aggregator.js'

interface TokenCostResult {
  scannedAt: string
  totals: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    estimatedCostUsd: number
  }
  byModel: Record<string, {
    model: string
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    estimatedCostUsd: number
    sessionCount: number
    messageCount: number
  }>
  byProject: Array<{
    projectPath: string
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    sessionCount: number
  }>
  byDate: Record<string, {
    date: string
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    sessions: number
  }>
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  const byModel: Record<string, {
    model: string
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    estimatedCostUsd: number
    sessionCount: number
    messageCount: number
  }> = {}

  const byProject: Record<string, {
    projectPath: string
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    sessionCount: number
  }> = {}

  const byDate: Record<string, {
    date: string
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    sessions: number
  }> = {}

  let totalInput = 0
  let totalOutput = 0
  let totalCacheCreate = 0
  let totalCacheRead = 0
  let totalCost = 0
  let fileCount = 0

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const projectPath = decodeProjectDirName(dirName)
    const files = readdirSync(dirPath, { withFileTypes: true })
      .filter((f) => f.isFile() && extname(f.name) === '.jsonl')
      .map((f) => join(dirPath, f.name))

    for (const filePath of files) {
      fileCount++
      if (fileCount % 50 === 0) {
        process.stdout.write(`\r  Processing ${fileCount}...`)
      }

      const messages = []
      let sessionDate = ''

      for await (const { entry, lineNo: _lineNo } of readJsonlFile(filePath)) {
        const classified = classifyEntry(entry, 0)
        for (const msg of classified) {
          messages.push(msg)
          if (!sessionDate && msg.timestamp) {
            sessionDate = new Date(msg.timestamp).toISOString().slice(0, 10)
          }
        }
      }

      const agg = aggregateTokens(messages)

      // Accumulate totals
      totalInput += agg.totalInputTokens
      totalOutput += agg.totalOutputTokens
      totalCacheCreate += agg.totalCacheCreationTokens
      totalCacheRead += agg.totalCacheReadTokens
      totalCost += agg.estimatedCostUsd

      // By model
      for (const [model, stats] of Object.entries(agg.byModel)) {
        if (!byModel[model]) {
          byModel[model] = {
            model,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            estimatedCostUsd: 0,
            sessionCount: 0,
            messageCount: 0,
          }
        }
        const m = byModel[model]!
        m.inputTokens += stats.inputTokens
        m.outputTokens += stats.outputTokens
        m.cacheCreationTokens += stats.cacheCreationTokens
        m.cacheReadTokens += stats.cacheReadTokens
        m.estimatedCostUsd += stats.estimatedCostUsd
        m.sessionCount++
        m.messageCount += stats.messageCount
      }

      // By project
      if (!byProject[projectPath]) {
        byProject[projectPath] = {
          projectPath,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          sessionCount: 0,
        }
      }
      byProject[projectPath]!.inputTokens += agg.totalInputTokens
      byProject[projectPath]!.outputTokens += agg.totalOutputTokens
      byProject[projectPath]!.estimatedCostUsd += agg.estimatedCostUsd
      byProject[projectPath]!.sessionCount++

      // By date
      if (sessionDate) {
        if (!byDate[sessionDate]) {
          byDate[sessionDate] = {
            date: sessionDate,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            sessions: 0,
          }
        }
        byDate[sessionDate]!.inputTokens += agg.totalInputTokens
        byDate[sessionDate]!.outputTokens += agg.totalOutputTokens
        byDate[sessionDate]!.estimatedCostUsd += agg.estimatedCostUsd
        byDate[sessionDate]!.sessions++
      }
    }
  }

  process.stdout.write('\n')

  const result: TokenCostResult = {
    scannedAt: new Date().toISOString(),
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreate,
      cacheReadTokens: totalCacheRead,
      estimatedCostUsd: totalCost,
    },
    byModel: Object.fromEntries(
      Object.entries(byModel).sort(([, a], [, b]) => b.estimatedCostUsd - a.estimatedCostUsd),
    ),
    byProject: Object.values(byProject)
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
      .slice(0, 20),
    byDate,
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '03-token-cost.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Token & Cost Analysis ===')
  console.log(`Total input tokens:   ${totalInput.toLocaleString()}`)
  console.log(`Total output tokens:  ${totalOutput.toLocaleString()}`)
  console.log(`Cache create tokens:  ${totalCacheCreate.toLocaleString()}`)
  console.log(`Cache read tokens:    ${totalCacheRead.toLocaleString()}`)
  console.log(`Estimated cost:       $${totalCost.toFixed(4)} USD`)
  console.log('\nBy model (top 5):')
  for (const [model, stats] of Object.entries(byModel).slice(0, 5)) {
    console.log(`  ${model}: $${stats.estimatedCostUsd.toFixed(4)} (${stats.messageCount} msgs)`)
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
