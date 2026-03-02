import { safeReadJson } from '../utils/file-io.js'
import {
  installedPluginsSchema,
  type InstalledPluginsFile,
} from '../schemas/plugin-registry.schema.js'

/**
 * Parse an installed_plugins.json file with Zod validation.
 * Returns null if the file doesn't exist or is not valid.
 */
export async function parseInstalledPlugins(
  filePath: string,
): Promise<InstalledPluginsFile | null> {
  const raw = await safeReadJson<unknown>(filePath)
  if (raw === null) return null

  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const result = installedPluginsSchema.safeParse(raw)
  if (!result.success) return null

  return result.data
}
