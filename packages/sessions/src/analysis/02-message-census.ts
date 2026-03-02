/**
 * Script 02: Message type census — scan all JSONL files and tabulate type distributions.
 * Outputs: src/analysis/output/02-message-census.json
 */

import { readdirSync, existsSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { writeFileSync } from 'fs'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { readJsonlFile } from '../core/jsonl-reader.js'
import { classifyEntry } from '../core/classifier.js'

interface CensusResult {
  scannedAt: string
  totalFiles: number
  totalLines: number
  totalParsedLines: number
  totalSkippedLines: number
  rawTypeDistribution: Record<string, number>
  classifiedTypeDistribution: Record<string, number>
  progressSubtypeDistribution: Record<string, number>
  systemSubtypeDistribution: Record<string, number>
  userTypeBreakdown: {
    realUser: number
    systemInjected: number
    toolResult: number
  }
  assistantContentBreakdown: {
    textBlocks: number
    thinkingBlocks: number
    toolUseBlocks: number
  }
  errors: string[]
}

async function main() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  const allFiles: string[] = []
  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const files = readdirSync(dirPath, { withFileTypes: true })
    for (const f of files) {
      if (f.isFile() && extname(f.name) === '.jsonl') {
        allFiles.push(join(dirPath, f.name))
      }
    }
  }

  console.log(`Scanning ${allFiles.length} JSONL files...`)

  const rawTypeDist: Record<string, number> = {}
  const classifiedTypeDist: Record<string, number> = {}
  const progressSubtypes: Record<string, number> = {}
  const systemSubtypes: Record<string, number> = {}
  let totalLines = 0
  let totalParsed = 0
  let totalSkipped = 0
  let realUser = 0
  let systemInjected = 0
  let toolResult = 0
  let textBlocks = 0
  let thinkingBlocks = 0
  let toolUseBlocks = 0
  const errors: string[] = []
  let fileCount = 0

  for (const filePath of allFiles) {
    fileCount++
    if (fileCount % 50 === 0) {
      process.stdout.write(`\r  Processing ${fileCount}/${allFiles.length}...`)
    }

    try {
      for await (const { entry, lineNo: _lineNo } of readJsonlFile(filePath)) {
        totalLines++
        totalParsed++

        const rawType = entry.type ?? '<undefined>'
        rawTypeDist[rawType] = (rawTypeDist[rawType] ?? 0) + 1

        // Track progress subtypes
        if (rawType === 'progress' && entry.data?.type) {
          const sub = String(entry.data.type)
          progressSubtypes[sub] = (progressSubtypes[sub] ?? 0) + 1
        }

        // Track system subtypes
        if (rawType === 'system' && entry.subtype) {
          const sub = String(entry.subtype)
          systemSubtypes[sub] = (systemSubtypes[sub] ?? 0) + 1
        }

        const classified = classifyEntry(entry, 0)
        for (const msg of classified) {
          classifiedTypeDist[msg.type] = (classifiedTypeDist[msg.type] ?? 0) + 1

          if (msg.type === 'text') {
            if (msg.role === 'user') realUser++
            else if (msg.role === 'system') systemInjected++
          }
          if (msg.type === 'tool_result') toolResult++
          if (msg.role === 'assistant') {
            if (msg.type === 'text') textBlocks++
            else if (msg.type === 'thinking') thinkingBlocks++
            else if (msg.type === 'tool_use') toolUseBlocks++
          }
        }
        if (classified.length === 0) totalSkipped++
      }
    } catch (err) {
      errors.push(`${filePath}: ${String(err)}`)
    }
  }

  process.stdout.write('\n')

  // Sort by frequency
  const sortedRaw = Object.fromEntries(
    Object.entries(rawTypeDist).sort(([, a], [, b]) => b - a),
  )
  const sortedClassified = Object.fromEntries(
    Object.entries(classifiedTypeDist).sort(([, a], [, b]) => b - a),
  )

  const result: CensusResult = {
    scannedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalLines,
    totalParsedLines: totalParsed,
    totalSkippedLines: totalSkipped,
    rawTypeDistribution: sortedRaw,
    classifiedTypeDistribution: sortedClassified,
    progressSubtypeDistribution: progressSubtypes,
    systemSubtypeDistribution: systemSubtypes,
    userTypeBreakdown: { realUser, systemInjected, toolResult },
    assistantContentBreakdown: { textBlocks, thinkingBlocks, toolUseBlocks },
    errors: errors.slice(0, 20),
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '02-message-census.json')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Message Census ===')
  console.log(`Total files:       ${result.totalFiles}`)
  console.log(`Total lines:       ${result.totalLines.toLocaleString()}`)
  console.log(`Parsed:            ${result.totalParsedLines.toLocaleString()}`)
  console.log(`Skipped (meta):    ${result.totalSkippedLines.toLocaleString()}`)
  console.log('\nRaw type distribution:')
  for (const [k, v] of Object.entries(sortedRaw)) {
    console.log(`  ${k.padEnd(30)} ${v.toLocaleString()}`)
  }
  console.log('\nClassified type distribution:')
  for (const [k, v] of Object.entries(sortedClassified)) {
    console.log(`  ${k.padEnd(30)} ${v.toLocaleString()}`)
  }
  console.log('\nUser message breakdown:')
  console.log(`  Real user:         ${realUser.toLocaleString()}`)
  console.log(`  System-injected:   ${systemInjected.toLocaleString()}`)
  console.log(`  Tool results:      ${toolResult.toLocaleString()}`)
  if (errors.length > 0) {
    console.log(`\nErrors: ${errors.length} (first 5):`)
    errors.slice(0, 5).forEach((e) => console.log(`  ${e}`))
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
