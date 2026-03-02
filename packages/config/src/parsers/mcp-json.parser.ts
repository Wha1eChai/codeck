import path from 'node:path'
import { safeReadJson } from '../utils/file-io.js'
import { mcpServerConfigSchema } from '../schemas/settings.schema.js'
import type { McpServerConfig } from '../schemas/settings.schema.js'

const MCP_JSON_FILENAME = '.mcp.json'

export interface McpJsonEntry {
  readonly name: string
  readonly config: McpServerConfig
}

/**
 * Parse a project-level .mcp.json file.
 *
 * Supports two formats:
 *   { "mcpServers": { "name": { command, args, env } } }
 *   { "name": { command, args, env } }   (flat — no wrapper key)
 */
export async function parseMcpJsonFile(
  filePath: string,
): Promise<readonly McpJsonEntry[] | null> {
  const raw = await safeReadJson<Record<string, unknown>>(filePath)
  if (!raw) return null

  const servers = (raw.mcpServers as Record<string, unknown> | undefined) ?? raw
  if (typeof servers !== 'object' || Array.isArray(servers)) return null

  const entries: McpJsonEntry[] = []

  for (const [name, value] of Object.entries(servers)) {
    if (name === 'mcpServers') continue
    if (!value || typeof value !== 'object') continue

    const parsed = mcpServerConfigSchema.safeParse(value)
    if (parsed.success) {
      entries.push({ name, config: parsed.data })
    } else {
      // Fallback: accept objects with at least command or url
      const v = value as Record<string, unknown>
      if (typeof v.command === 'string' || typeof v.url === 'string') {
        entries.push({
          name,
          config: {
            command: typeof v.command === 'string' ? v.command : undefined,
            args: Array.isArray(v.args) ? v.args : undefined,
            env: typeof v.env === 'object' && v.env !== null
              ? v.env as Record<string, string>
              : undefined,
            url: typeof v.url === 'string' ? v.url : undefined,
          },
        })
      }
    }
  }

  return entries
}

/**
 * Get the .mcp.json file path for a project.
 */
export function projectMcpJsonPath(projectPath: string): string {
  return path.join(projectPath, MCP_JSON_FILENAME)
}
