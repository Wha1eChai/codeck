import type { HookEntry, HooksMap } from '../schemas/settings.schema.js'
import type { HooksJsonFile } from '../schemas/hooks-json.schema.js'

export interface ResolvedHookEntry extends HookEntry {
  readonly source: 'settings' | `plugin:${string}`
}

export interface ResolvedHookRule {
  readonly matcher: string
  readonly hooks: readonly ResolvedHookEntry[]
  readonly description?: string | undefined
  readonly source: 'settings' | `plugin:${string}`
}

export type ResolvedHooksMap = Readonly<Record<string, readonly ResolvedHookRule[]>>

interface PluginHooksInput {
  readonly pluginId: string
  readonly installPath: string
  readonly hooksFile: HooksJsonFile
}

const PLUGIN_ROOT_PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}'

/**
 * Replace ${CLAUDE_PLUGIN_ROOT} in a command string with the actual install path.
 */
function substitutePluginRoot(command: string, installPath: string): string {
  if (!command.includes(PLUGIN_ROOT_PLACEHOLDER)) return command
  return command.split(PLUGIN_ROOT_PLACEHOLDER).join(installPath)
}

/**
 * Normalize timeout: if `timeout` is set (in seconds) but `timeout_ms` is not,
 * convert to `timeout_ms` (multiply by 1000).
 */
function normalizeHookEntryTimeout(entry: HookEntry): HookEntry {
  if (entry.timeout !== undefined && entry.timeout_ms === undefined) {
    const { timeout: _timeout, ...rest } = entry
    return {
      ...rest,
      timeout_ms: _timeout * 1000,
    }
  }
  return entry
}

/**
 * Merge settings.json hooks + all enabled plugin hooks.json into a single resolved map.
 *
 * - Replace ${CLAUDE_PLUGIN_ROOT} in plugin hook commands with the actual installPath
 * - Mark each rule with source: 'settings' or 'plugin:xxx'
 * - Normalize timeout to timeout_ms
 */
export function resolveHooks(
  settingsHooks: HooksMap | undefined,
  pluginHooks: readonly PluginHooksInput[],
): ResolvedHooksMap {
  const result: Record<string, ResolvedHookRule[]> = {}

  // Process settings hooks
  if (settingsHooks) {
    for (const [eventType, rules] of Object.entries(settingsHooks)) {
      const resolved = rules.map((rule): ResolvedHookRule => ({
        matcher: rule.matcher,
        hooks: rule.hooks.map((entry): ResolvedHookEntry => ({
          ...normalizeHookEntryTimeout(entry),
          source: 'settings',
        })),
        description: rule.description,
        source: 'settings',
      }))

      const existing = result[eventType]
      if (existing) {
        existing.push(...resolved)
      } else {
        result[eventType] = resolved
      }
    }
  }

  // Process plugin hooks
  for (const plugin of pluginHooks) {
    const source = `plugin:${plugin.pluginId}` as const

    for (const [eventType, rules] of Object.entries(plugin.hooksFile.hooks)) {
      const resolved = rules.map((rule): ResolvedHookRule => ({
        matcher: rule.matcher,
        hooks: rule.hooks.map((entry): ResolvedHookEntry => ({
          ...normalizeHookEntryTimeout({
            ...entry,
            command: substitutePluginRoot(entry.command, plugin.installPath),
          }),
          source,
        })),
        description: rule.description,
        source,
      }))

      const existing = result[eventType]
      if (existing) {
        existing.push(...resolved)
      } else {
        result[eventType] = resolved
      }
    }
  }

  return result
}
