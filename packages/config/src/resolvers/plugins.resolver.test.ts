import { describe, it, expect } from 'vitest'
import { resolvePlugins } from './plugins.resolver.js'
import type { InstalledPluginsFile } from '../schemas/plugin-registry.schema.js'
import type { PluginManifest } from '../schemas/plugin-manifest.schema.js'

const installed: InstalledPluginsFile = {
  version: 2,
  plugins: {
    'context7@claude-plugins-official': [
      {
        scope: 'user',
        installPath: '/plugins/context7',
        version: '1.0.0',
        installedAt: '2025-12-01T00:00:00Z',
      },
    ],
    'hookify@claude-plugins-official': [
      {
        scope: 'user',
        installPath: '/plugins/hookify',
        version: '2.0.0',
        installedAt: '2025-12-02T00:00:00Z',
      },
    ],
  },
}

describe('resolvePlugins', () => {
  it('resolves all installed plugins with enabled state', () => {
    const result = resolvePlugins(
      installed,
      { 'context7@claude-plugins-official': true, 'hookify@claude-plugins-official': false },
      new Map(),
      [],
    )
    expect(result).toHaveLength(2)
    const ctx = result.find((p) => p.id === 'context7@claude-plugins-official')
    expect(ctx?.enabled).toBe(true)
    expect(ctx?.name).toBe('context7')
    expect(ctx?.marketplace).toBe('claude-plugins-official')

    const hook = result.find((p) => p.id === 'hookify@claude-plugins-official')
    expect(hook?.enabled).toBe(false)
  })

  it('marks blocked plugins', () => {
    const result = resolvePlugins(
      installed,
      { 'context7@claude-plugins-official': true },
      new Map(),
      ['context7@claude-plugins-official'],
    )
    const ctx = result.find((p) => p.id === 'context7@claude-plugins-official')
    expect(ctx?.blocked).toBe(true)
  })

  it('attaches manifests by installPath', () => {
    const manifest: PluginManifest = { name: 'Context7', description: 'Docs' }
    const manifests = new Map<string, PluginManifest>([['/plugins/context7', manifest]])

    const result = resolvePlugins(installed, {}, manifests, [])
    const ctx = result.find((p) => p.id === 'context7@claude-plugins-official')
    expect(ctx?.manifest?.name).toBe('Context7')
  })

  it('defaults enabled to true when not in enabledPlugins', () => {
    const result = resolvePlugins(installed, {}, new Map(), [])
    expect(result.every((p) => p.enabled)).toBe(true)
  })
})
