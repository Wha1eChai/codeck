/**
 * Script 07: Subagent usage patterns.
 * Outputs: src/analysis/output/07-subagent-patterns.json
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'
import { findSubagentInvocations } from '../core/subagent-linker.js'

interface SubagentPatternsResult {
  scannedAt: string
  totalSessions: number
  sessionsWithSubagents: number
  totalSubagentInvocations: number
  avgSubagentsPerSession: number
  subagentsByToolName: Record<string, number>
  sidechainSessionCount: number
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  let totalSessions = 0
  let sessionsWithSubagents = 0
  let totalSubagentInvocations = 0
  const byTool: Record<string, number> = {}
  let sidechainSessions = 0
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

      // Check if this is a sidechain session (all messages are sidechain)
      const nonSidechain = messages.filter((m) => !m.isSidechain)
      if (nonSidechain.length === 0 && messages.length > 0) {
        sidechainSessions++
        continue
      }

      const subagents = findSubagentInvocations(messages)
      if (subagents.length > 0) {
        sessionsWithSubagents++
        totalSubagentInvocations += subagents.length

        for (const s of subagents) {
          byTool[s.toolName] = (byTool[s.toolName] ?? 0) + 1
        }
      }
    }
  }

  process.stdout.write('\n')

  const result: SubagentPatternsResult = {
    scannedAt: new Date().toISOString(),
    totalSessions,
    sessionsWithSubagents,
    totalSubagentInvocations,
    avgSubagentsPerSession:
      sessionsWithSubagents > 0
        ? totalSubagentInvocations / sessionsWithSubagents
        : 0,
    subagentsByToolName: Object.fromEntries(
      Object.entries(byTool).sort(([, a], [, b]) => b - a),
    ),
    sidechainSessionCount: sidechainSessions,
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '07-subagent-patterns.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Subagent Patterns ===')
  console.log(`Total sessions:          ${totalSessions}`)
  console.log(`Sessions with subagents: ${sessionsWithSubagents}`)
  console.log(`Total invocations:       ${totalSubagentInvocations}`)
  console.log(`Sidechain sessions:      ${sidechainSessions}`)
  console.log('\nBy tool name:')
  for (const [tool, count] of Object.entries(byTool)) {
    console.log(`  ${tool.padEnd(20)} ${count}`)
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
