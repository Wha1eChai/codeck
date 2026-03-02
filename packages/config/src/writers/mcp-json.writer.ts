import { safeReadJson, atomicWriteJson } from '../utils/file-io.js'
import { projectMcpJsonPath } from '../parsers/mcp-json.parser.js'

/**
 * Writer for project-level .mcp.json files.
 */
export class McpJsonWriter {
  /**
   * Add or update an MCP server in the project's .mcp.json.
   */
  async upsertServer(
    projectPath: string,
    name: string,
    config: { readonly command: string; readonly args?: readonly string[]; readonly env?: Record<string, string> },
  ): Promise<void> {
    const filePath = projectMcpJsonPath(projectPath)
    const data = await safeReadJson<Record<string, unknown>>(filePath) ?? {}

    const servers = (data.mcpServers as Record<string, unknown>) ?? {}
    const entry: Record<string, unknown> = { command: config.command }
    if (config.args && config.args.length > 0) entry.args = [...config.args]
    if (config.env && Object.keys(config.env).length > 0) entry.env = { ...config.env }

    const updated = {
      ...data,
      mcpServers: { ...servers, [name]: entry },
    }
    await atomicWriteJson(filePath, updated)
  }

  /**
   * Remove an MCP server from the project's .mcp.json.
   */
  async removeServer(projectPath: string, name: string): Promise<void> {
    const filePath = projectMcpJsonPath(projectPath)
    const data = await safeReadJson<Record<string, unknown>>(filePath)
    if (!data) return

    const servers = (data.mcpServers as Record<string, unknown>) ?? {}
    if (!(name in servers)) return

    const { [name]: _, ...rest } = servers
    const updated = { ...data, mcpServers: rest }
    await atomicWriteJson(filePath, updated)
  }
}
