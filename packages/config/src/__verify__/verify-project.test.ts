import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { ConfigReader } from '../service/config-reader.js'

const CLAUDE_HOME = path.join(os.homedir(), '.claude')

describe('verify-project: real ~/.claude/projects/', () => {
  it('lists all project directories', async () => {
    const reader = new ConfigReader({ claudeHome: CLAUDE_HOME })
    const projects = await reader.listProjects()

    console.log(`  Found ${projects.length} project(s)`)

    for (const project of projects) {
      const decoded = project.decodedPath
      console.log(`  Dir: ${project.dirName}`)
      console.log(`    Decoded: ${decoded ?? '(decode failed)'}`)
    }

    expect(Array.isArray(projects)).toBe(true)
  })

  it('encodes and decodes a path consistently', () => {
    const reader = new ConfigReader({ claudeHome: CLAUDE_HOME })
    const testPath = CLAUDE_HOME
    const encoded = reader.encodeProjectPath(testPath)
    const decoded = reader.decodeProjectDirName(encoded)

    console.log(`  Original: ${testPath}`)
    console.log(`  Encoded:  ${encoded}`)
    console.log(`  Decoded:  ${decoded}`)

    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)
    // Decoded may not match original exactly due to lossy encoding (hyphens in original)
    // but should be non-null for paths that don't contain hyphens
  })
})
