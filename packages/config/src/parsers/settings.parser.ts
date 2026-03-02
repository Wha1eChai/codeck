import { safeReadJson } from '../utils/file-io.js'
import { claudeSettingsSchema, type ClaudeSettings } from '../schemas/settings.schema.js'

/**
 * Parse a settings.json file with Zod validation.
 * Returns null if the file doesn't exist or is not a valid JSON object.
 * Uses .passthrough() so unknown keys are preserved.
 */
export async function parseSettingsFile(filePath: string): Promise<ClaudeSettings | null> {
  const raw = await safeReadJson<unknown>(filePath)
  if (raw === null) return null

  // Must be a plain object
  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const result = claudeSettingsSchema.safeParse(raw)
  if (!result.success) {
    // If Zod validation fails, return the raw object as passthrough
    // This handles cases where the file has valid JSON but unexpected field types
    return raw as ClaudeSettings
  }

  return result.data
}
