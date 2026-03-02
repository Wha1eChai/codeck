import { describe, it, expect } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { parseInstalledPlugins } from '../parsers/plugin-registry.parser.js'
import { parsePluginManifest } from '../parsers/plugin-manifest.parser.js'
import { installedPluginsPath } from '../constants/paths.js'

const CLAUDE_HOME = path.join(os.homedir(), '.claude')

describe('verify-plugins: real ~/.claude/installed_plugins.json', () => {
  it('parses the installed plugins file without error', async () => {
    const filePath = installedPluginsPath(CLAUDE_HOME)
    const plugins = await parseInstalledPlugins(filePath)

    if (!plugins) {
      console.log('  No installed_plugins.json found — skipping')
      return
    }

    expect(plugins.version).toBe(2)
    expect(typeof plugins.plugins).toBe('object')

    const pluginIds = Object.keys(plugins.plugins)
    console.log('  Installed plugin IDs:', pluginIds)
    console.log('  Plugin count:', pluginIds.length)

    for (const [id, entries] of Object.entries(plugins.plugins)) {
      console.log(`  Plugin "${id}": ${entries.length} version(s)`)
      for (const entry of entries) {
        console.log(`    installPath: ${entry.installPath}`)
        console.log(`    version: ${entry.version ?? 'none'}`)
      }
    }
  })

  it('can read plugin manifests for installed plugins', async () => {
    const filePath = installedPluginsPath(CLAUDE_HOME)
    const plugins = await parseInstalledPlugins(filePath)

    if (!plugins) {
      console.log('  No installed_plugins.json found — skipping')
      return
    }

    for (const [id, entries] of Object.entries(plugins.plugins)) {
      const entry = entries[0]
      if (!entry) continue

      const manifest = await parsePluginManifest(entry.installPath)
      if (manifest) {
        console.log(`  Plugin "${id}" manifest: name="${manifest.name}" version="${manifest.version ?? 'n/a'}"`)
        expect(typeof manifest.name).toBe('string')
        // version is optional in some manifests
        if (manifest.version !== undefined) {
          expect(typeof manifest.version).toBe('string')
        }
      } else {
        console.log(`  Plugin "${id}" manifest: not found at ${entry.installPath}`)
      }
    }
  })
})
