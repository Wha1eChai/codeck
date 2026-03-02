import { DEFAULT_CLAUDE_HOME } from '../constants/paths.js'
import { SettingsWriter } from '../writers/settings.writer.js'
import { PluginToggleWriter } from '../writers/plugin-toggle.writer.js'
import { HooksWriter } from '../writers/hooks.writer.js'
import { McpServerWriter } from '../writers/mcp-server.writer.js'
import { McpJsonWriter } from '../writers/mcp-json.writer.js'
import { writeMemoryContent } from '../writers/memory.writer.js'
import type { SettingsScope, HookRule, McpServerConfig } from '../schemas/settings.schema.js'

export type McpScope = 'user' | 'project'

export class ConfigWriter {
  private readonly settingsWriter: SettingsWriter
  private readonly pluginToggle: PluginToggleWriter
  private readonly hooksWriter: HooksWriter
  private readonly mcpWriter: McpServerWriter
  private readonly mcpJsonWriter: McpJsonWriter
  private readonly projectPath: string | undefined

  constructor(options?: {
    readonly claudeHome?: string
    readonly projectPath?: string
  }) {
    const claudeHome = options?.claudeHome ?? DEFAULT_CLAUDE_HOME
    this.projectPath = options?.projectPath
    this.settingsWriter = new SettingsWriter({
      claudeHome,
      projectPath: options?.projectPath,
    })
    this.pluginToggle = new PluginToggleWriter(this.settingsWriter)
    this.hooksWriter = new HooksWriter(this.settingsWriter)
    this.mcpWriter = new McpServerWriter(this.settingsWriter)
    this.mcpJsonWriter = new McpJsonWriter()
  }

  // ── Settings ──

  writeSettingsKey(scope: SettingsScope, key: string, value: unknown): Promise<void> {
    return this.settingsWriter.writeSettingsKey(scope, key, value)
  }

  removeSettingsKey(scope: SettingsScope, key: string): Promise<void> {
    return this.settingsWriter.removeSettingsKey(scope, key)
  }

  // ── Env ──

  setEnvVar(scope: SettingsScope, name: string, value: string): Promise<void> {
    return this.settingsWriter.setEnvVar(scope, name, value)
  }

  removeEnvVar(scope: SettingsScope, name: string): Promise<void> {
    return this.settingsWriter.removeEnvVar(scope, name)
  }

  // ── Plugins ──

  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    return this.pluginToggle.setPluginEnabled(pluginId, enabled)
  }

  // ── Hooks ──

  addHookRule(scope: SettingsScope, eventType: string, rule: HookRule): Promise<void> {
    return this.hooksWriter.addHookRule(scope, eventType, rule)
  }

  removeHookRule(scope: SettingsScope, eventType: string, index: number): Promise<void> {
    return this.hooksWriter.removeHookRule(scope, eventType, index)
  }

  updateHookRule(scope: SettingsScope, eventType: string, index: number, rule: HookRule): Promise<void> {
    return this.hooksWriter.updateHookRule(scope, eventType, index, rule)
  }

  // ── MCP Servers ──

  /**
   * Upsert an MCP server. 'user' scope writes to settings.json,
   * 'project' scope writes to <project>/.mcp.json.
   */
  async upsertMcpServer(
    scope: McpScope,
    name: string,
    config: McpServerConfig | { command: string; args?: readonly string[]; env?: Record<string, string> },
  ): Promise<void> {
    if (scope === 'project') {
      if (!this.projectPath) throw new Error('Cannot write project MCP: no projectPath configured')
      await this.mcpJsonWriter.upsertServer(this.projectPath, name, config as { command: string; args?: readonly string[]; env?: Record<string, string> })
    } else {
      await this.mcpWriter.upsertMcpServer('user', name, config as McpServerConfig)
    }
  }

  /**
   * Remove an MCP server. 'user' scope writes to settings.json,
   * 'project' scope writes to <project>/.mcp.json.
   */
  async removeMcpServer(scope: McpScope, name: string): Promise<void> {
    if (scope === 'project') {
      if (!this.projectPath) throw new Error('Cannot write project MCP: no projectPath configured')
      await this.mcpJsonWriter.removeServer(this.projectPath, name)
    } else {
      await this.mcpWriter.removeMcpServer('user', name)
    }
  }

  // ── Memory ──

  writeMemoryContent(filePath: string, content: string): Promise<void> {
    return writeMemoryContent(filePath, content)
  }
}
