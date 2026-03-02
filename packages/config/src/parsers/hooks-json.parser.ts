import { safeReadJson } from '../utils/file-io.js'
import { pluginHooksPath } from '../constants/paths.js'
import {
  hooksJsonFileSchema,
  type HooksJsonFile,
} from '../schemas/hooks-json.schema.js'

/**
 * Parse a hooks.json file with Zod validation.
 * Returns null if the file doesn't exist or is not valid.
 */
export async function parseHooksJsonFile(
  filePath: string,
): Promise<HooksJsonFile | null> {
  const raw = await safeReadJson<unknown>(filePath)
  if (raw === null) return null

  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const result = hooksJsonFileSchema.safeParse(raw)
  if (!result.success) return null

  return result.data
}

/**
 * Parse a plugin's hooks.json from its install directory.
 * Reads from {installPath}/hooks/hooks.json.
 * Returns null if file doesn't exist or is not valid.
 */
export async function parsePluginHooks(
  installPath: string,
): Promise<HooksJsonFile | null> {
  const hooksFile = pluginHooksPath(installPath)
  return parseHooksJsonFile(hooksFile)
}
