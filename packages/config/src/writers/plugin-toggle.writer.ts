import type { SettingsWriter } from './settings.writer.js'
import { parseSettingsFile } from '../parsers/settings.parser.js'
import { globalSettingsPath } from '../constants/paths.js'
import { normalizeEnabledPlugins } from '../schemas/settings.schema.js'

/**
 * Writer for toggling plugin enabled/disabled state.
 * Reads enabledPlugins from user settings, normalizes to Record<string, boolean>,
 * sets/toggles the value, and writes back.
 */
export class PluginToggleWriter {
  private readonly settingsWriter: SettingsWriter

  constructor(settingsWriter: SettingsWriter) {
    this.settingsWriter = settingsWriter
  }

  /**
   * Set a plugin's enabled state.
   * Always writes to 'user' scope since plugins are global.
   */
  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    // Read current settings to get existing enabledPlugins
    const claudeHome = this.getClaudeHome()
    const settings = await parseSettingsFile(globalSettingsPath(claudeHome))
    const current = normalizeEnabledPlugins(settings?.enabledPlugins)
    const updated = { ...current, [pluginId]: enabled }
    await this.settingsWriter.writeSettingsKey('user', 'enabledPlugins', updated)
  }

  private getClaudeHome(): string {
    // Access the claudeHome through the writer's options
    // The SettingsWriter exposes claudeHome via its constructor options
    return (this.settingsWriter as unknown as { claudeHome: string }).claudeHome
  }
}
