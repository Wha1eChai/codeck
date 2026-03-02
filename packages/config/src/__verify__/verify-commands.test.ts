import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { scanCommandsDir } from '../parsers/command.parser.js'
import { globalCommandsDir } from '../constants/paths.js'

const CLAUDE_HOME = path.join(os.homedir(), '.claude')

describe('verify-commands: real ~/.claude/commands/', () => {
  it('scans global commands directory without error', async () => {
    const dir = globalCommandsDir(CLAUDE_HOME)
    const commands = await scanCommandsDir(dir, 'global')

    console.log(`  Found ${commands.length} global command(s) in ${dir}`)

    for (const cmd of commands) {
      console.log(`  [${cmd.scope}] /${cmd.slashName} — ${cmd.filePath}`)
      if (cmd.tokens.hasArguments || cmd.tokens.shellTokens.length > 0) {
        console.log(`    tokens: hasArguments=${cmd.tokens.hasArguments}`)
      }

      // Verify structure
      expect(typeof cmd.slashName).toBe('string')
      expect(cmd.slashName.length).toBeGreaterThan(0)
      expect(typeof cmd.body).toBe('string')
    }
  })

  it('computes correct slashName from directory structure', async () => {
    const dir = globalCommandsDir(CLAUDE_HOME)
    const commands = await scanCommandsDir(dir, 'global')

    for (const cmd of commands) {
      // slashName should not contain path separators
      expect(cmd.slashName).not.toContain('/')
      expect(cmd.slashName).not.toContain('\\')

      // Nested commands use colon notation: "ns:name"
      if (cmd.slashName.includes(':')) {
        const parts = cmd.slashName.split(':')
        expect(parts.length).toBe(2)
        expect(parts[0]!.length).toBeGreaterThan(0)
        expect(parts[1]!.length).toBeGreaterThan(0)
      }
    }
  })
})
