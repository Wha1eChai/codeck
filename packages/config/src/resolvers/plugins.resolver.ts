import type { InstalledPluginsFile } from '../schemas/plugin-registry.schema.js'
import type { PluginManifest } from '../schemas/plugin-manifest.schema.js'

export interface ResolvedPlugin {
  readonly id: string
  readonly name: string
  readonly marketplace: string
  readonly installPath: string
  readonly version: string
  readonly installedAt: string
  readonly lastUpdated: string
  readonly enabled: boolean
  readonly blocked: boolean
  readonly manifest: PluginManifest | null
  readonly scope: string
}

/**
 * Split a plugin ID into name and marketplace.
 * Plugin ID format: `pluginName@marketplace`
 */
function splitPluginId(pluginId: string): { readonly name: string; readonly marketplace: string } {
  const atIndex = pluginId.lastIndexOf('@')
  if (atIndex <= 0) {
    return { name: pluginId, marketplace: '' }
  }
  return {
    name: pluginId.slice(0, atIndex),
    marketplace: pluginId.slice(atIndex + 1),
  }
}

/**
 * Resolve installed plugins into a flat list of ResolvedPlugin entries.
 *
 * @param installed - Parsed installed_plugins.json data
 * @param enabledPlugins - Normalized Record<string, boolean> from settings
 * @param manifests - Map of installPath -> PluginManifest
 * @param blocklist - Array of blocked plugin identifiers
 */
export function resolvePlugins(
  installed: InstalledPluginsFile,
  enabledPlugins: Readonly<Record<string, boolean>>,
  manifests: ReadonlyMap<string, PluginManifest>,
  blocklist: readonly string[],
): readonly ResolvedPlugin[] {
  const blockedSet = new Set(blocklist)
  const result: ResolvedPlugin[] = []

  for (const [pluginId, entries] of Object.entries(installed.plugins)) {
    const { name, marketplace } = splitPluginId(pluginId)

    for (const entry of entries) {
      const enabled = enabledPlugins[pluginId] ?? true
      const blocked = blockedSet.has(pluginId) || blockedSet.has(name)
      const manifest = manifests.get(entry.installPath) ?? null

      result.push({
        id: pluginId,
        name,
        marketplace,
        installPath: entry.installPath,
        version: entry.version,
        installedAt: entry.installedAt,
        lastUpdated: entry.lastUpdated ?? '',
        enabled,
        blocked,
        manifest,
        scope: entry.scope,
      })
    }
  }

  return result
}
