import type { SettingsWriter } from './settings.writer.js'
import type { SettingsScope, HookRule, HooksMap } from '../schemas/settings.schema.js'
import { parseSettingsFile } from '../parsers/settings.parser.js'
import { globalSettingsPath, projectSettingsPath, localSettingsPath } from '../constants/paths.js'
import { encodeProjectPath } from '../utils/path-encoding.js'

/**
 * Writer for hook rules in settings.json.
 */
export class HooksWriter {
  private readonly settingsWriter: SettingsWriter

  constructor(settingsWriter: SettingsWriter) {
    this.settingsWriter = settingsWriter
  }

  /**
   * Add a hook rule to a specific event type.
   */
  async addHookRule(
    scope: SettingsScope,
    eventType: string,
    rule: HookRule,
  ): Promise<void> {
    const hooks = await this.readHooks(scope)
    const existing = hooks[eventType] ?? []
    const updatedRules = [...existing, rule]
    const updatedHooks: HooksMap = { ...hooks, [eventType]: updatedRules }
    await this.settingsWriter.writeSettingsKey(scope, 'hooks', updatedHooks)
  }

  /**
   * Remove a hook rule at a specific index from an event type.
   */
  async removeHookRule(
    scope: SettingsScope,
    eventType: string,
    index: number,
  ): Promise<void> {
    const hooks = await this.readHooks(scope)
    const existing = hooks[eventType]
    if (!existing || index < 0 || index >= existing.length) return

    const updatedRules = existing.filter((_, i) => i !== index)
    const updatedHooks: HooksMap =
      updatedRules.length === 0
        ? removeKey(hooks, eventType)
        : { ...hooks, [eventType]: updatedRules }
    await this.settingsWriter.writeSettingsKey(scope, 'hooks', updatedHooks)
  }

  /**
   * Update a hook rule at a specific index.
   */
  async updateHookRule(
    scope: SettingsScope,
    eventType: string,
    index: number,
    rule: HookRule,
  ): Promise<void> {
    const hooks = await this.readHooks(scope)
    const existing = hooks[eventType]
    if (!existing || index < 0 || index >= existing.length) return

    const updatedRules = existing.map((r, i) => (i === index ? rule : r))
    const updatedHooks: HooksMap = { ...hooks, [eventType]: updatedRules }
    await this.settingsWriter.writeSettingsKey(scope, 'hooks', updatedHooks)
  }

  private async readHooks(scope: SettingsScope): Promise<HooksMap> {
    const filePath = this.getFilePath(scope)
    const settings = await parseSettingsFile(filePath)
    return settings?.hooks ?? {}
  }

  private getFilePath(scope: SettingsScope): string {
    const writer = this.settingsWriter as unknown as {
      claudeHome: string
      projectPath: string | undefined
    }
    switch (scope) {
      case 'user':
        return globalSettingsPath(writer.claudeHome)
      case 'project': {
        if (!writer.projectPath) {
          throw new Error('projectPath is required for "project" scope')
        }
        return projectSettingsPath(writer.projectPath)
      }
      case 'local': {
        if (!writer.projectPath) {
          throw new Error('projectPath is required for "local" scope')
        }
        const encoded = encodeProjectPath(writer.projectPath)
        return localSettingsPath(writer.claudeHome, encoded)
      }
    }
  }
}

function removeKey(
  map: HooksMap,
  key: string,
): HooksMap {
  const { [key]: _, ...rest } = map
  return rest
}
