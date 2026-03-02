// ── Schemas ──
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
} from './schemas/settings.schema.js'

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
} from './schemas/plugin-registry.schema.js'

export {
  pluginAuthorSchema,
  pluginManifestSchema,
  type PluginAuthor,
  type PluginManifest,
} from './schemas/plugin-manifest.schema.js'

export {
  hooksJsonFileSchema,
  type HooksJsonFile,
} from './schemas/hooks-json.schema.js'

export {
  mcpServerEntrySchema,
  type McpServerEntry,
} from './schemas/mcp-server.schema.js'

export {
  commandFrontmatterSchema,
  type CommandFrontmatter,
  type CommandScope,
  type CommandTokens,
  type CommandFile,
} from './schemas/command.schema.js'

export {
  skillFrontmatterSchema,
  type SkillFrontmatter,
  type SkillScope,
  type SkillFile,
} from './schemas/skill.schema.js'

export {
  agentFrontmatterSchema,
  type AgentFrontmatter,
  type AgentScope,
  type AgentFile,
} from './schemas/agent.schema.js'

export {
  type ClaudeMdScope,
  type ClaudeMdFile,
  type RuleFile,
} from './schemas/claude-md.schema.js'

// ── Parsers ──
export { parseSettingsFile } from './parsers/settings.parser.js'
export { parseInstalledPlugins } from './parsers/plugin-registry.parser.js'
export { parsePluginManifest } from './parsers/plugin-manifest.parser.js'
export { parseHooksJsonFile, parsePluginHooks } from './parsers/hooks-json.parser.js'
export { parseCommandFile, scanCommandsDir } from './parsers/command.parser.js'
export { parseSkillDir, scanSkillsDir } from './parsers/skill.parser.js'
export { parseAgentFile, scanAgentsDir } from './parsers/agent.parser.js'
export { parseClaudeMdFile } from './parsers/claude-md.parser.js'
export { parseRuleFile, scanRulesDir } from './parsers/rules.parser.js'
export { parseMcpJsonFile, projectMcpJsonPath, type McpJsonEntry } from './parsers/mcp-json.parser.js'

// ── Resolvers ──
export { resolveSettings, type ResolvedSettings } from './resolvers/settings.resolver.js'
export { resolvePlugins, type ResolvedPlugin } from './resolvers/plugins.resolver.js'
export { resolveHooks, type ResolvedHooksMap, type ResolvedHookEntry, type ResolvedHookRule } from './resolvers/hooks.resolver.js'
export { resolveCommands } from './resolvers/commands.resolver.js'
export { resolveAgents } from './resolvers/agents.resolver.js'
export { resolveSkills } from './resolvers/skills.resolver.js'
export { resolveClaudeMdFiles } from './resolvers/claude-md.resolver.js'

// ── Writers ──
export { SettingsWriter, type SettingsWriterOptions } from './writers/settings.writer.js'
export { PluginToggleWriter } from './writers/plugin-toggle.writer.js'
export { HooksWriter } from './writers/hooks.writer.js'
export { McpServerWriter } from './writers/mcp-server.writer.js'
export { McpJsonWriter } from './writers/mcp-json.writer.js'
export { writeMemoryContent } from './writers/memory.writer.js'

// ── Service ──
export { ConfigReader, type ProjectDirInfo } from './service/config-reader.js'
export { ConfigWriter, type McpScope } from './service/config-writer.js'
export { PluginContentService } from './service/plugin-content.js'

// ── Utils ──
export { parseFrontmatter, type FrontmatterResult } from './utils/frontmatter.js'
export { encodeProjectPath, decodeProjectDirName } from './utils/path-encoding.js'
export {
  safeReadFile,
  safeReadJson,
  safeListDir,
  safeListDirEntries,
  pathExists,
  atomicWriteJson,
  atomicWriteText,
} from './utils/file-io.js'

// ── Constants ──
export {
  DEFAULT_CLAUDE_HOME,
  SETTINGS_FILENAME,
  PLUGINS_DIR,
  INSTALLED_PLUGINS_FILENAME,
  COMMANDS_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  RULES_DIR,
  PROJECTS_DIR,
  CLAUDE_MD_FILENAME,
  SKILL_MD_FILENAME,
  globalSettingsPath,
  projectSettingsPath,
  localSettingsPath,
  installedPluginsPath,
  globalCommandsDir,
  projectCommandsDir,
  globalAgentsDir,
  projectAgentsDir,
  globalSkillsDir,
  globalRulesDir,
  projectRulesDir,
  pluginManifestPath,
  pluginHooksPath,
  pluginCommandsDir,
  pluginAgentsDir,
  pluginSkillsDir,
  pluginRulesDir,
  projectMemoryDir,
} from './constants/paths.js'

// ── Adapters (UI-friendly types) ──
export {
  toPluginInfo,
  toAgentInfo,
  toSkillInfo,
  toMcpServerInfo,
  toMemoryFileInfo,
  toCliHooks,
  type PluginInfo,
  type AgentInfo,
  type SkillInfo,
  type McpServerInfo,
  type MemoryFileInfo,
  type CliHookEventType,
  type CliHookEntry,
  type CliHookRule,
  type CliHooks,
} from './adapters/index.js'
