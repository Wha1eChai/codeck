// ============================================================
// MCP Mapper — McpServerEntry[] → SDK Record<string, SDKMcpServerConfig>
// ============================================================

import type { McpServerEntry } from '@codeck/config'
import type { SDKMcpServerConfig } from './sdk-types'

/**
 * Convert cc-desk-config McpServerEntry array to SDK-compatible mcpServers record.
 * Pure function — no side effects. Skips invalid entries (no command and no url).
 */
export function mapMcpServersToSDKConfig(
  entries: readonly McpServerEntry[],
): Record<string, SDKMcpServerConfig> {
  const result: Record<string, SDKMcpServerConfig> = {}

  for (const entry of entries) {
    const config = mapSingleEntry(entry)
    if (config) {
      result[entry.name] = config
    }
  }

  return result
}

function mapSingleEntry(entry: McpServerEntry): SDKMcpServerConfig | null {
  const { config } = entry

  if (config.type === 'sse' && config.url) {
    return {
      type: 'sse',
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
    }
  }

  if (config.type === 'http' && config.url) {
    return {
      type: 'http',
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
    }
  }

  if (config.command) {
    return {
      ...(config.type === 'stdio' ? { type: 'stdio' as const } : {}),
      command: config.command,
      ...(config.args && config.args.length > 0 ? { args: config.args } : {}),
      ...(config.env && Object.keys(config.env).length > 0 ? { env: config.env } : {}),
    } as SDKMcpServerConfig
  }

  // Invalid entry: no command and no url — skip
  return null
}
