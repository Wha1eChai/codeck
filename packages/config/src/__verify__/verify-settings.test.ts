import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { parseSettingsFile } from '../parsers/settings.parser.js'
import { resolveSettings } from '../resolvers/settings.resolver.js'
import { globalSettingsPath } from '../constants/paths.js'

const CLAUDE_HOME = path.join(os.homedir(), '.claude')

describe('verify-settings: real ~/.claude/settings.json', () => {
  it('parses the global settings file without error', async () => {
    const filePath = globalSettingsPath(CLAUDE_HOME)
    const settings = await parseSettingsFile(filePath)

    // Should not be null (file exists)
    expect(settings).not.toBeNull()

    // env should contain known keys
    if (settings?.env) {
      console.log('  env keys:', Object.keys(settings.env))
      expect(typeof settings.env).toBe('object')
    }

    // permissions should be structured
    if (settings?.permissions) {
      console.log('  permissions.allow count:', settings.permissions.allow?.length ?? 0)
      console.log('  permissions.defaultMode:', settings.permissions.defaultMode)
    }

    // hooks should have event types
    if (settings?.hooks) {
      console.log('  hook event types:', Object.keys(settings.hooks))
    }

    // enabledPlugins should be Record<string, boolean>
    if (settings?.enabledPlugins) {
      const plugins = settings.enabledPlugins
      if (!Array.isArray(plugins)) {
        console.log('  enabled plugins:', Object.keys(plugins).length)
        console.log('  plugin IDs:', Object.keys(plugins))
      }
    }

    // language
    if (settings?.language) {
      console.log('  language:', settings.language)
    }
  })

  it('resolves single-layer settings', async () => {
    const filePath = globalSettingsPath(CLAUDE_HOME)
    const settings = await parseSettingsFile(filePath)
    if (!settings) return

    const resolved = resolveSettings([{ settings, label: 'global' }])

    // Should produce valid merged result
    expect(resolved.env).toBeDefined()
    expect(resolved.permissions).toBeDefined()
    expect(resolved.hooks).toBeDefined()
    expect(resolved.enabledPlugins).toBeDefined()

    console.log('\n  Resolved settings summary:')
    console.log('    env vars:', Object.keys(resolved.env).length)
    console.log('    allow rules:', resolved.permissions.allow.length)
    console.log('    hook types:', Object.keys(resolved.hooks).length)
    console.log('    enabled plugins:', Object.keys(resolved.enabledPlugins).length)
    console.log('    mcp servers:', Object.keys(resolved.mcpServers).length)
  })
})
