export {
  hookEventTypes,
  hookEntrySchema,
  hookRuleSchema,
  hooksMapSchema,
  permissionModeSchema,
  permissionsSchema,
  mcpServerConfigSchema,
  enabledPluginsSchema,
  normalizeEnabledPlugins,
  claudeSettingsSchema,
  type HookEventType,
  type HookEntry,
  type HookRule,
  type HooksMap,
  type PermissionMode,
  type Permissions,
  type McpServerConfig,
  type EnabledPlugins,
  type ClaudeSettings,
  type SettingsScope,
} from './settings.schema.js'

export {
  pluginEntrySchema,
  installedPluginsSchema,
  marketplaceSourceSchema,
  marketplaceEntrySchema,
  knownMarketplacesSchema,
  blocklistEntrySchema,
  blocklistSchema,
  type PluginEntry,
  type InstalledPluginsFile,
  type MarketplaceSource,
  type MarketplaceEntry,
  type KnownMarketplacesFile,
  type BlocklistEntry,
  type BlocklistFile,
} from './plugin-registry.schema.js'

export {
  pluginAuthorSchema,
  pluginManifestSchema,
  type PluginAuthor,
  type PluginManifest,
} from './plugin-manifest.schema.js'

export {
  hooksJsonFileSchema,
  type HooksJsonFile,
} from './hooks-json.schema.js'

export {
  mcpServerEntrySchema,
  type McpServerEntry,
} from './mcp-server.schema.js'

export {
  commandFrontmatterSchema,
  type CommandFrontmatter,
  type CommandScope,
  type CommandTokens,
  type CommandFile,
} from './command.schema.js'

export {
  skillFrontmatterSchema,
  type SkillFrontmatter,
  type SkillScope,
  type SkillFile,
} from './skill.schema.js'

export {
  agentFrontmatterSchema,
  type AgentFrontmatter,
  type AgentScope,
  type AgentFile,
} from './agent.schema.js'

export {
  type ClaudeMdScope,
  type ClaudeMdFile,
  type RuleFile,
} from './claude-md.schema.js'
