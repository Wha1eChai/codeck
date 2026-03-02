/**
 * Script 01: Scan all projects and sessions — get metadata overview.
 * Outputs: src/analysis/output/01-scan-projects.json
 */

import { readdirSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { mkdirSync } from 'fs'
import { CLAUDE_PROJECTS_DIR } from '../shared/claude-paths.js'
import { decodeProjectDirName } from '../shared/project-decoder.js'
import type { ProjectInfo } from '../core/types.js'

interface ScanResult {
  scannedAt: string
  projectsDir: string
  totalProjects: number
  totalSessions: number
  totalFileSizeBytes: number
  minFileSizeBytes: number
  maxFileSizeBytes: number
  projectsWithIndex: number
  projectsWithoutIndex: number
  projects: ProjectInfo[]
  sessionSizeDistribution: {
    under1KB: number
    under10KB: number
    under100KB: number
    under1MB: number
    over1MB: number
  }
}

async function main() {
  console.log(`Scanning: ${CLAUDE_PROJECTS_DIR}`)

  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects dir not found: ${CLAUDE_PROJECTS_DIR}`)
    process.exit(1)
  }

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  console.log(`Found ${projectDirs.length} project directories`)

  const projects: ProjectInfo[] = []
  let totalSessions = 0
  let totalFileSizeBytes = 0
  let minFileSizeBytes = Infinity
  let maxFileSizeBytes = 0
  let projectsWithIndex = 0
  const sizeDistrib = { under1KB: 0, under10KB: 0, under100KB: 0, under1MB: 0, over1MB: 0 }

  for (const dirName of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dirName)
    const files = readdirSync(dirPath, { withFileTypes: true })

    const jsonlFiles = files.filter(
      (f) => f.isFile() && extname(f.name) === '.jsonl',
    )

    const sessionIds: string[] = []
    let projectSize = 0

    for (const f of jsonlFiles) {
      const sessionId = f.name.replace('.jsonl', '')
      sessionIds.push(sessionId)
      const filePath = join(dirPath, f.name)
      const stat = statSync(filePath)
      const size = stat.size
      projectSize += size
      minFileSizeBytes = Math.min(minFileSizeBytes, size)
      maxFileSizeBytes = Math.max(maxFileSizeBytes, size)

      if (size < 1024) sizeDistrib.under1KB++
      else if (size < 10240) sizeDistrib.under10KB++
      else if (size < 102400) sizeDistrib.under100KB++
      else if (size < 1048576) sizeDistrib.under1MB++
      else sizeDistrib.over1MB++
    }

    const indexPath = join(dirPath, 'sessions-index.json')
    const hasIndex = existsSync(indexPath)
    if (hasIndex) projectsWithIndex++

    totalSessions += sessionIds.length
    totalFileSizeBytes += projectSize

    projects.push({
      dirName,
      projectPath: decodeProjectDirName(dirName),
      sessionCount: sessionIds.length,
      totalFileSize: projectSize,
      hasSessionsIndex: hasIndex,
      sessionIds,
    })
  }

  projects.sort((a, b) => b.totalFileSize - a.totalFileSize)

  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    projectsDir: CLAUDE_PROJECTS_DIR,
    totalProjects: projects.length,
    totalSessions,
    totalFileSizeBytes,
    minFileSizeBytes: minFileSizeBytes === Infinity ? 0 : minFileSizeBytes,
    maxFileSizeBytes,
    projectsWithIndex,
    projectsWithoutIndex: projects.length - projectsWithIndex,
    sessionSizeDistribution: sizeDistrib,
    projects,
  }

  const outputDir = new URL('./output', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, '01-scan-projects.json')

  const { writeFileSync } = await import('fs')
  writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('\n=== Scan Results ===')
  console.log(`Total projects:    ${result.totalProjects}`)
  console.log(`Total sessions:    ${result.totalSessions}`)
  console.log(`Total size:        ${(result.totalFileSizeBytes / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Min file size:     ${result.minFileSizeBytes} bytes`)
  console.log(`Max file size:     ${(result.maxFileSizeBytes / 1024).toFixed(1)} KB`)
  console.log(`With index:        ${result.projectsWithIndex}`)
  console.log(`Without index:     ${result.projectsWithoutIndex}`)
  console.log('\nSize distribution:')
  console.log(`  < 1KB:    ${sizeDistrib.under1KB}`)
  console.log(`  < 10KB:   ${sizeDistrib.under10KB}`)
  console.log(`  < 100KB:  ${sizeDistrib.under100KB}`)
  console.log(`  < 1MB:    ${sizeDistrib.under1MB}`)
  console.log(`  >= 1MB:   ${sizeDistrib.over1MB}`)
  console.log(`\nTop 5 largest projects:`)
  for (const p of projects.slice(0, 5)) {
    console.log(`  ${p.dirName}: ${p.sessionCount} sessions, ${(p.totalFileSize / 1024).toFixed(1)} KB`)
  }
  console.log(`\nOutput: ${outputPath}`)
}

main().catch(console.error)
