import { safeReadJson } from '../utils/file-io.js'
import { pluginManifestPath } from '../constants/paths.js'
import {
  pluginManifestSchema,
  type PluginManifest,
} from '../schemas/plugin-manifest.schema.js'

/**
 * Parse a plugin's manifest (plugin.json) from its install directory.
 * Reads from {installPath}/.claude-plugin/plugin.json.
 * Returns null if file doesn't exist or is not valid.
 */
export async function parsePluginManifest(
  installPath: string,
): Promise<PluginManifest | null> {
  const manifestFile = pluginManifestPath(installPath)
  const raw = await safeReadJson<unknown>(manifestFile)
  if (raw === null) return null

  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const result = pluginManifestSchema.safeParse(raw)
  if (!result.success) return null

  return result.data
}
