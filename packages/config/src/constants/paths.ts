import path from 'node:path'
import os from 'node:os'

/** Default Claude home directory (~/.claude) */
export const DEFAULT_CLAUDE_HOME = path.join(os.homedir(), '.claude')

// ── Top-level files ──

export const SETTINGS_FILENAME = 'settings.json'
export const CONFIG_FILENAME = 'config.json'
export const PROJECT_CONFIG_FILENAME = 'project-config.json'
export const CREDENTIALS_FILENAME = '.credentials.json'
export const STATS_CACHE_FILENAME = 'stats-cache.json'

// ── Plugin files ──

export const PLUGINS_DIR = 'plugins'
export const INSTALLED_PLUGINS_FILENAME = 'installed_plugins.json'
export const BLOCKLIST_FILENAME = 'blocklist.json'
export const KNOWN_MARKETPLACES_FILENAME = 'known_marketplaces.json'
export const INSTALL_COUNTS_CACHE_FILENAME = 'install_counts_cache.json'
export const PLUGIN_MANIFEST_DIR = '.claude-plugin'
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json'
export const PLUGIN_HOOKS_DIR = 'hooks'
export const PLUGIN_HOOKS_FILENAME = 'hooks.json'

// ── Resource directories ──

export const COMMANDS_DIR = 'commands'
export const AGENTS_DIR = 'agents'
export const SKILLS_DIR = 'skills'
export const RULES_DIR = 'rules'
export const PROJECTS_DIR = 'projects'
export const MEMORY_DIR = 'memory'

// ── Markdown files ──

export const CLAUDE_MD_FILENAME = 'CLAUDE.md'
export const SKILL_MD_FILENAME = 'SKILL.md'

// ── Project-level settings ──

export const PROJECT_CLAUDE_DIR = '.claude'

// ── Helper functions ──

export function claudeHomePath(claudeHome: string, ...segments: readonly string[]): string {
  return path.join(claudeHome, ...segments)
}

export function globalSettingsPath(claudeHome: string): string {
  return path.join(claudeHome, SETTINGS_FILENAME)
}

export function projectSettingsPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_CLAUDE_DIR, SETTINGS_FILENAME)
}

export function localSettingsPath(claudeHome: string, encodedProject: string): string {
  return path.join(claudeHome, PROJECTS_DIR, encodedProject, SETTINGS_FILENAME)
}

export function installedPluginsPath(claudeHome: string): string {
  return path.join(claudeHome, PLUGINS_DIR, INSTALLED_PLUGINS_FILENAME)
}

export function blocklistPath(claudeHome: string): string {
  return path.join(claudeHome, PLUGINS_DIR, BLOCKLIST_FILENAME)
}

export function knownMarketplacesPath(claudeHome: string): string {
  return path.join(claudeHome, PLUGINS_DIR, KNOWN_MARKETPLACES_FILENAME)
}

export function globalCommandsDir(claudeHome: string): string {
  return path.join(claudeHome, COMMANDS_DIR)
}

export function projectCommandsDir(projectPath: string): string {
  return path.join(projectPath, PROJECT_CLAUDE_DIR, COMMANDS_DIR)
}

export function globalAgentsDir(claudeHome: string): string {
  return path.join(claudeHome, AGENTS_DIR)
}

export function projectAgentsDir(projectPath: string): string {
  return path.join(projectPath, PROJECT_CLAUDE_DIR, AGENTS_DIR)
}

export function globalSkillsDir(claudeHome: string): string {
  return path.join(claudeHome, SKILLS_DIR)
}

export function globalRulesDir(claudeHome: string): string {
  return path.join(claudeHome, RULES_DIR)
}

export function projectRulesDir(projectPath: string): string {
  return path.join(projectPath, PROJECT_CLAUDE_DIR, RULES_DIR)
}

export function pluginManifestPath(installPath: string): string {
  return path.join(installPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILENAME)
}

export function pluginHooksPath(installPath: string): string {
  return path.join(installPath, PLUGIN_HOOKS_DIR, PLUGIN_HOOKS_FILENAME)
}

export function pluginCommandsDir(installPath: string): string {
  return path.join(installPath, COMMANDS_DIR)
}

export function pluginAgentsDir(installPath: string): string {
  return path.join(installPath, AGENTS_DIR)
}

export function pluginSkillsDir(installPath: string): string {
  return path.join(installPath, SKILLS_DIR)
}

export function pluginRulesDir(installPath: string): string {
  return path.join(installPath, RULES_DIR)
}

export function projectMemoryDir(claudeHome: string, encodedProject: string): string {
  return path.join(claudeHome, PROJECTS_DIR, encodedProject, MEMORY_DIR)
}
