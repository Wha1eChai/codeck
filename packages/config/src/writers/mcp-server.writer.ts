import type { SettingsWriter } from './settings.writer.js'
import type { SettingsScope, McpServerConfig } from '../schemas/settings.schema.js'
import { parseSettingsFile } from '../parsers/settings.parser.js'
import { globalSettingsPath, projectSettingsPath, localSettingsPath } from '../constants/paths.js'
import { encodeProjectPath } from '../utils/path-encoding.js'

/**
 * Writer for MCP server entries in settings.json.
 */
export class McpServerWriter {
  private readonly settingsWriter: SettingsWriter

  constructor(settingsWriter: SettingsWriter) {
    this.settingsWriter = settingsWriter
  }

  /**
   * Insert or update an MCP server configuration.
   */
  async upsertMcpServer(
    scope: SettingsScope,
    name: string,
    config: McpServerConfig,
  ): Promise<void> {
    const servers = await this.readMcpServers(scope)
    const updated = { ...servers, [name]: config }
    await this.settingsWriter.writeSettingsKey(scope, 'mcpServers', updated)
  }

  /**
   * Remove an MCP server configuration.
   */
  async removeMcpServer(
    scope: SettingsScope,
    name: string,
  ): Promise<void> {
    const servers = await this.readMcpServers(scope)
    if (!(name in servers)) return
    const { [name]: _, ...rest } = servers
    await this.settingsWriter.writeSettingsKey(scope, 'mcpServers', rest)
  }

  private async readMcpServers(
    scope: SettingsScope,
  ): Promise<Record<string, McpServerConfig>> {
    const filePath = this.getFilePath(scope)
    const settings = await parseSettingsFile(filePath)
    return settings?.mcpServers ?? {}
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
