/**
 * Script 05: File change heatmap from file-history-snapshot entries.
 * Outputs: src/analysis/output/05-file-changes.json
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'
import { extractFileChanges, buildFileHeatmap } from '../core/file-tracker.js'
import type { FileChange } from '../core/file-tracker.js'

interface FileChangesResult {
  scannedAt: string
  totalSnapshots: number
  totalFileChanges: number
  uniqueFilesChanged: number
  topChangedFiles: Array<{ filePath: string; changeCount: number }>
  fileExtensionDistribution: Record<string, number>
  sessionFileChangeCounts: {
    p50: number
    p90: number
    p99: number
    max: number
  }
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  const allChanges: FileChange[] = []
  const sessionChangeCounts: number[] = []
  let totalSnapshots = 0
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

      const snapshots = messages.filter((m) => m.type === 'file_snapshot')
      totalSnapshots += snapshots.length

      const changes = extractFileChanges(messages)
      allChanges.push(...changes)
      sessionChangeCounts.push(changes.length)
    }
  }

  process.stdout.write('\n')

  const heatmap = buildFileHeatmap(allChanges)

  // Top changed files
  const topChanged = Array.from(heatmap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50)
    .map(([filePath, changeCount]) => ({ filePath, changeCount }))

  // File extension distribution
  const extDist: Record<string, number> = {}
  for (const change of allChanges) {
    const ext = change.filePath.includes('.')
      ? '.' + change.filePath.split('.').pop()!.toLowerCase()
      : '<no-ext>'
    extDist[ext] = (extDist[ext] ?? 0) + 1
  }

  // Percentiles for session change counts
  const sorted = [...sessionChangeCounts].sort((a, b) => a - b)
  const p = (pct: number) => {
    const idx = Math.floor(sorted.length * pct)
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0
  }

  const result: FileChangesResult = {
    scannedAt: new Date().toISOString(),
    totalSnapshots,
    totalFileChanges: allChanges.length,
    uniqueFilesChanged: heatmap.size,
    topChangedFiles: topChanged,
    fileExtensionDistribution: Object.fromEntries(
      Object.entries(extDist).sort(([, a], [, b]) => b - a),
    ),
    sessionFileChangeCounts: {
      p50: p(0.5),
      p90: p(0.9),
      p99: p(0.99),
      max: sorted[sorted.length - 1] ?? 0,
    },
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '05-file-changes.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== File Changes Analysis ===')
  console.log(`Total snapshots:       ${totalSnapshots.toLocaleString()}`)
  console.log(`Total file changes:    ${result.totalFileChanges.toLocaleString()}`)
  console.log(`Unique files changed:  ${result.uniqueFilesChanged.toLocaleString()}`)
  console.log('\nTop 10 changed files:')
  for (const { filePath, changeCount } of topChanged.slice(0, 10)) {
    const name = filePath.split(/[/\\]/).pop() ?? filePath
    console.log(`  ${name.padEnd(40)} ${changeCount}`)
  }
  console.log('\nTop 5 file extensions:')
  for (const [ext, count] of Object.entries(extDist).sort(([, a], [, b]) => b - a).slice(0, 5)) {
    console.log(`  ${ext.padEnd(15)} ${count}`)
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
