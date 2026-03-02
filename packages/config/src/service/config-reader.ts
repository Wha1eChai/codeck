import path from 'node:path'
import { parseSettingsFile } from '../parsers/settings.parser.js'
import { parseInstalledPlugins } from '../parsers/plugin-registry.parser.js'
import { parsePluginManifest } from '../parsers/plugin-manifest.parser.js'
import { parseHooksJsonFile } from '../parsers/hooks-json.parser.js'
import { scanCommandsDir } from '../parsers/command.parser.js'
import { scanSkillsDir } from '../parsers/skill.parser.js'
import { scanAgentsDir } from '../parsers/agent.parser.js'
import { scanRulesDir } from '../parsers/rules.parser.js'
import { parseMcpJsonFile, projectMcpJsonPath } from '../parsers/mcp-json.parser.js'
import { resolveSettings, type ResolvedSettings } from '../resolvers/settings.resolver.js'
import { resolvePlugins, type ResolvedPlugin } from '../resolvers/plugins.resolver.js'
import { resolveHooks, type ResolvedHooksMap } from '../resolvers/hooks.resolver.js'
import { resolveCommands } from '../resolvers/commands.resolver.js'
import { resolveAgents } from '../resolvers/agents.resolver.js'
import { resolveSkills } from '../resolvers/skills.resolver.js'
import { resolveClaudeMdFiles } from '../resolvers/claude-md.resolver.js'
import { encodeProjectPath, decodeProjectDirName } from '../utils/path-encoding.js'
import { safeListDirEntries, safeReadJson } from '../utils/file-io.js'
import {
  DEFAULT_CLAUDE_HOME,
  globalSettingsPath,
  projectSettingsPath,
  localSettingsPath,
  installedPluginsPath,
  blocklistPath,
  globalCommandsDir,
  projectCommandsDir,
  globalAgentsDir,
  projectAgentsDir,
  globalSkillsDir,
  globalRulesDir,
  projectRulesDir,
  pluginHooksPath,
  pluginCommandsDir,
  pluginAgentsDir,
  pluginSkillsDir,
  PROJECTS_DIR,
} from '../constants/paths.js'
import type { ClaudeSettings } from '../schemas/settings.schema.js'
import type { InstalledPluginsFile } from '../schemas/plugin-registry.schema.js'
import type { PluginManifest } from '../schemas/plugin-manifest.schema.js'
import type { HooksJsonFile } from '../schemas/hooks-json.schema.js'
import type { McpServerEntry } from '../schemas/mcp-server.schema.js'
import type { CommandFile } from '../schemas/command.schema.js'
import type { AgentFile } from '../schemas/agent.schema.js'
import type { SkillFile } from '../schemas/skill.schema.js'
import type { ClaudeMdFile, RuleFile } from '../schemas/claude-md.schema.js'

export interface ProjectDirInfo {
  readonly dirName: string
  readonly decodedPath: string | null
}

export class ConfigReader {
  private readonly claudeHome: string

  constructor(options?: { readonly claudeHome?: string }) {
    this.claudeHome = options?.claudeHome ?? DEFAULT_CLAUDE_HOME
  }

  // ── Settings ──

  async getGlobalSettings(): Promise<ClaudeSettings | null> {
    return parseSettingsFile(globalSettingsPath(this.claudeHome))
  }

  async getProjectSettings(projectPath: string): Promise<ClaudeSettings | null> {
    return parseSettingsFile(projectSettingsPath(projectPath))
  }

  async getLocalSettings(projectPath: string): Promise<ClaudeSettings | null> {
    const encoded = encodeProjectPath(projectPath)
    return parseSettingsFile(localSettingsPath(this.claudeHome, encoded))
  }

  async getResolvedSettings(projectPath?: string): Promise<ResolvedSettings> {
    const layers: Array<{ settings: ClaudeSettings; label: string }> = []

    const global = await this.getGlobalSettings()
    if (global) layers.push({ settings: global, label: 'global' })

    if (projectPath) {
      const project = await this.getProjectSettings(projectPath)
      if (project) layers.push({ settings: project, label: 'project' })

      const local = await this.getLocalSettings(projectPath)
      if (local) layers.push({ settings: local, label: 'local' })
    }

    return resolveSettings(layers)
  }

  // ── Plugins ──

  async getInstalledPlugins(): Promise<InstalledPluginsFile | null> {
    return parseInstalledPlugins(installedPluginsPath(this.claudeHome))
  }

  async getResolvedPlugins(projectPath?: string): Promise<readonly ResolvedPlugin[]> {
    const installed = await this.getInstalledPlugins()
    if (!installed) return []

    const settings = await this.getResolvedSettings(projectPath)

    // Load manifests for all installed plugins
    const manifests = new Map<string, PluginManifest>()
    for (const [_pluginId, entries] of Object.entries(installed.plugins)) {
      const entry = entries[0]
      if (!entry) continue
      const manifest = await parsePluginManifest(entry.installPath)
      if (manifest) manifests.set(entry.installPath, manifest)
    }

    // Load blocklist
    const blocklistData = await safeReadJson<{ plugins?: Array<{ plugin: string }> }>(
      blocklistPath(this.claudeHome),
    )
    const blocklist = blocklistData?.plugins?.map((b) => b.plugin) ?? []

    return resolvePlugins(installed, settings.enabledPlugins, manifests, blocklist)
  }

  // ── Hooks ──

  async getEffectiveHooks(projectPath?: string): Promise<ResolvedHooksMap> {
    const settings = await this.getResolvedSettings(projectPath)
    const plugins = await this.getResolvedPlugins(projectPath)

    const pluginHooksInputs: Array<{
      pluginId: string
      installPath: string
      hooksFile: HooksJsonFile
    }> = []

    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      const hooksFile = await parseHooksJsonFile(pluginHooksPath(plugin.installPath))
      if (hooksFile) {
        pluginHooksInputs.push({
          pluginId: plugin.id,
          installPath: plugin.installPath,
          hooksFile,
        })
      }
    }

    return resolveHooks(
      settings.hooks as Parameters<typeof resolveHooks>[0],
      pluginHooksInputs,
    )
  }

  // ── Commands ──

  async getAllCommands(projectPath?: string): Promise<readonly CommandFile[]> {
    const globalCmds = await scanCommandsDir(globalCommandsDir(this.claudeHome), 'global')
    const projectCmds = projectPath
      ? await scanCommandsDir(projectCommandsDir(projectPath), 'project')
      : []

    const plugins = await this.getResolvedPlugins(projectPath)
    const pluginCmds: CommandFile[] = []
    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      const cmds = await scanCommandsDir(pluginCommandsDir(plugin.installPath), 'plugin', plugin.id)
      pluginCmds.push(...cmds)
    }

    return resolveCommands({
      globalCommands: globalCmds,
      projectCommands: projectCmds,
      pluginCommands: pluginCmds,
    })
  }

  // ── Agents ──

  async getAllAgents(projectPath?: string): Promise<readonly AgentFile[]> {
    const globalAgs = await scanAgentsDir(globalAgentsDir(this.claudeHome), 'global')
    const projectAgs = projectPath
      ? await scanAgentsDir(projectAgentsDir(projectPath), 'project')
      : []

    const plugins = await this.getResolvedPlugins(projectPath)
    const pluginAgs: AgentFile[] = []
    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      const ags = await scanAgentsDir(pluginAgentsDir(plugin.installPath), 'plugin', plugin.id)
      pluginAgs.push(...ags)
    }

    return resolveAgents({
      globalAgents: globalAgs,
      projectAgents: projectAgs,
      pluginAgents: pluginAgs,
    })
  }

  // ── Skills ──

  async getAllSkills(): Promise<readonly SkillFile[]> {
    const globalSks = await scanSkillsDir(globalSkillsDir(this.claudeHome), 'global')

    const plugins = await this.getResolvedPlugins()
    const pluginSks: SkillFile[] = []
    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      const sks = await scanSkillsDir(pluginSkillsDir(plugin.installPath), 'plugin', plugin.id)
      pluginSks.push(...sks)
    }

    return resolveSkills({
      globalSkills: globalSks,
      pluginSkills: pluginSks,
    })
  }

  // ── Rules ──

  async getRuleFiles(projectPath?: string): Promise<readonly RuleFile[]> {
    const globalRules = await scanRulesDir(globalRulesDir(this.claudeHome), 'global')
    const projectRules = projectPath
      ? await scanRulesDir(projectRulesDir(projectPath), 'project')
      : []
    return [...globalRules, ...projectRules]
  }

  // ── CLAUDE.md ──

  async getClaudeMdFiles(projectPath?: string): Promise<readonly ClaudeMdFile[]> {
    return resolveClaudeMdFiles(this.claudeHome, projectPath)
  }

  // ── MCP Servers ──

  async getMcpServers(projectPath?: string): Promise<readonly McpServerEntry[]> {
    const settings = await this.getResolvedSettings(projectPath)
    const entries: McpServerEntry[] = []

    // User scope: from settings.json mcpServers
    for (const [name, config] of Object.entries(settings.mcpServers)) {
      entries.push({
        name,
        config,
        scope: 'user',
        source: 'settings',
      })
    }

    // Project scope: from <project>/.mcp.json
    if (projectPath) {
      const mcpEntries = await parseMcpJsonFile(projectMcpJsonPath(projectPath))
      if (mcpEntries) {
        for (const entry of mcpEntries) {
          entries.push({
            name: entry.name,
            config: entry.config,
            scope: 'project',
            source: '.mcp.json',
          })
        }
      }
    }

    return entries
  }

  // ── Project utils ──

  encodeProjectPath(projectPath: string): string {
    return encodeProjectPath(projectPath)
  }

  decodeProjectDirName(dirName: string): string | null {
    return decodeProjectDirName(dirName)
  }

  async listProjects(): Promise<readonly ProjectDirInfo[]> {
    const projectsDir = path.join(this.claudeHome, PROJECTS_DIR)
    const entries = await safeListDirEntries(projectsDir)
    const results: ProjectDirInfo[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      results.push({
        dirName: entry.name,
        decodedPath: decodeProjectDirName(entry.name),
      })
    }

    return results
  }
}
