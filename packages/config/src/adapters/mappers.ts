import type { ResolvedPlugin } from '../resolvers/plugins.resolver.js'
import type { AgentFile } from '../schemas/agent.schema.js'
import type { SkillFile } from '../schemas/skill.schema.js'
import type { McpServerEntry } from '../schemas/mcp-server.schema.js'
import type { ClaudeMdFile } from '../schemas/claude-md.schema.js'
import type { ResolvedHooksMap } from '../resolvers/hooks.resolver.js'
import type {
  PluginInfo,
  AgentInfo,
  SkillInfo,
  McpServerInfo,
  MemoryFileInfo,
  CliHooks,
} from './ui-types.js'

/**
 * Map a ResolvedPlugin to a flat PluginInfo for UI rendering.
 */
export function toPluginInfo(plugin: ResolvedPlugin): PluginInfo {
  return {
    id: plugin.id,
    marketplace: plugin.marketplace,
    version: plugin.version ?? '',
    installedAt: plugin.installedAt ?? '',
    lastUpdated: plugin.lastUpdated ?? '',
    enabled: plugin.enabled,
  }
}

/**
 * Map an AgentFile to a flat AgentInfo for UI rendering.
 * Maps 'global' scope to 'user' for backward compatibility.
 */
export function toAgentInfo(agent: AgentFile): AgentInfo {
  return {
    filename: agent.filename,
    name: agent.name,
    description: agent.frontmatter.description,
    scope: agent.scope === 'global' ? 'user' : 'project',
  }
}

/**
 * Map a SkillFile to a flat SkillInfo for UI rendering.
 */
export function toSkillInfo(skill: SkillFile): SkillInfo {
  return {
    name: skill.name,
    source: skill.pluginId ?? (skill.scope === 'global' ? 'user' : skill.scope),
  }
}

/**
 * Map a McpServerEntry to a flat McpServerInfo for UI rendering.
 */
export function toMcpServerInfo(entry: McpServerEntry): McpServerInfo {
  return {
    name: entry.name,
    command: entry.config.command ?? '',
    args: Array.isArray(entry.config.args) ? entry.config.args : [],
    env: entry.config.env as Readonly<Record<string, string>> | undefined,
    scope: entry.scope === 'local' ? 'user' : entry.scope,
  }
}

/**
 * Map a ClaudeMdFile to a flat MemoryFileInfo for UI rendering.
 * Maps 5 internal scopes to 3 UI scopes.
 */
export function toMemoryFileInfo(file: ClaudeMdFile): MemoryFileInfo {
  const scopeMap: Record<string, 'user-global' | 'project' | 'project-memory'> = {
    'user-global': 'user-global',
    'project-root': 'project',
    'project-claude-dir': 'project',
    'local-project': 'project',
    'memory': 'project-memory',
  }

  return {
    path: file.filePath,
    name: file.name ?? file.filePath.split(/[\\/]/).pop() ?? '',
    scope: scopeMap[file.scope] ?? 'project',
    content: file.content,
  }
}

/**
 * Map a ResolvedHooksMap to the flat CliHooks format for UI rendering.
 */
export function toCliHooks(resolved: ResolvedHooksMap): CliHooks {
  const result: Record<string, Array<{
    matcher: string
    hooks: Array<{
      type: 'command'
      command: string
      timeout?: number | undefined
      timeout_ms?: number | undefined
      statusMessage?: string | undefined
      async?: boolean | undefined
      description?: string | undefined
    }>
    description?: string | undefined
  }>> = {}

  for (const [eventType, rules] of Object.entries(resolved)) {
    result[eventType] = rules.map((rule) => ({
      matcher: rule.matcher,
      description: rule.description,
      hooks: rule.hooks.map((entry) => ({
        type: entry.type,
        command: entry.command,
        timeout: entry.timeout,
        timeout_ms: entry.timeout_ms,
        statusMessage: entry.statusMessage,
        async: entry.async,
        description: entry.description,
      })),
    }))
  }

  return result
}
