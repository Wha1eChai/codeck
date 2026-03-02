import { parsePluginManifest } from '../parsers/plugin-manifest.parser.js'
import { parsePluginHooks } from '../parsers/hooks-json.parser.js'
import type { PluginManifest } from '../schemas/plugin-manifest.schema.js'
import type { HooksJsonFile } from '../schemas/hooks-json.schema.js'

/**
 * Service for reading plugin content (manifest, hooks, etc.).
 * Commands, agents, and skills parsers will be added in Phase 3.
 */
export class PluginContentService {
  /**
   * Read and parse a plugin's manifest (plugin.json).
   * Returns null if the manifest doesn't exist or is invalid.
   */
  async getPluginManifest(installPath: string): Promise<PluginManifest | null> {
    return parsePluginManifest(installPath)
  }

  /**
   * Read and parse a plugin's hooks.json.
   * Returns null if the hooks file doesn't exist or is invalid.
   */
  async getPluginHooks(installPath: string): Promise<HooksJsonFile | null> {
    return parsePluginHooks(installPath)
  }
}
