import type {
  ClaudeSettings,
  HooksMap,
  HookRule,
  McpServerConfig,
  Permissions,
} from '../schemas/settings.schema.js'
import { normalizeEnabledPlugins } from '../schemas/settings.schema.js'

/**
 * Resolved settings after merging all layers.
 */
export interface ResolvedSettings {
  readonly env: Readonly<Record<string, string>>
  readonly permissions: {
    readonly allow: readonly string[]
    readonly deny: readonly string[]
    readonly ask: readonly string[]
    readonly defaultMode: string | undefined
  }
  readonly hooks: Readonly<Record<string, readonly HookRule[]>>
  readonly enabledPlugins: Readonly<Record<string, boolean>>
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>
  readonly language: string | undefined
  readonly model: string | undefined
  /** All extra keys from all layers, merged with last-wins */
  readonly extra: Readonly<Record<string, unknown>>
}

interface SettingsLayer {
  readonly settings: ClaudeSettings
  readonly label: string
}

const KNOWN_KEYS = new Set([
  'env',
  'permissions',
  'hooks',
  'enabledPlugins',
  'mcpServers',
  'language',
  'model',
  'skipDangerousModePermissionPrompt',
])

/**
 * Merge settings layers with priority: later layers override earlier ones.
 *
 * Priority order (pass lowest-priority first):
 *   [User Global, Project Shared, Local]
 *
 * Merge rules:
 * - Scalar fields (language, model, defaultMode): last-wins
 * - permissions.allow/deny/ask: additive (array concat, deduplicated)
 * - permissions.defaultMode: last-wins
 * - hooks: per eventType key, concat rule arrays (all layers effective)
 * - mcpServers: per server name, last-wins
 * - enabledPlugins: normalize to Record<string, boolean>, per key merge
 * - env: per key, last-wins
 */
export function resolveSettings(layers: readonly SettingsLayer[]): ResolvedSettings {
  const env: Record<string, string> = {}
  const allowSet = new Set<string>()
  const denySet = new Set<string>()
  const askSet = new Set<string>()
  let defaultMode: string | undefined
  const hooks: Record<string, HookRule[]> = {}
  const enabledPlugins: Record<string, boolean> = {}
  const mcpServers: Record<string, McpServerConfig> = {}
  let language: string | undefined
  let model: string | undefined
  const extra: Record<string, unknown> = {}

  for (const layer of layers) {
    const s = layer.settings

    // env: per-key merge
    if (s.env) {
      for (const [k, v] of Object.entries(s.env)) {
        env[k] = v
      }
    }

    // permissions: additive arrays + last-wins defaultMode
    if (s.permissions) {
      mergePermissions(s.permissions, allowSet, denySet, askSet)
      if (s.permissions.defaultMode !== undefined) {
        defaultMode = s.permissions.defaultMode
      }
    }

    // hooks: concat per eventType
    if (s.hooks) {
      mergeHooks(s.hooks, hooks)
    }

    // enabledPlugins: normalize and per-key merge
    if (s.enabledPlugins !== undefined) {
      const normalized = normalizeEnabledPlugins(s.enabledPlugins)
      for (const [k, v] of Object.entries(normalized)) {
        enabledPlugins[k] = v
      }
    }

    // mcpServers: per-name last-wins
    if (s.mcpServers) {
      for (const [name, config] of Object.entries(s.mcpServers)) {
        mcpServers[name] = config
      }
    }

    // Scalars: last-wins
    if (s.language !== undefined) language = s.language
    if (s.model !== undefined) model = s.model

    // Extra keys
    for (const [k, v] of Object.entries(s)) {
      if (!KNOWN_KEYS.has(k)) {
        extra[k] = v
      }
    }
  }

  return {
    env,
    permissions: {
      allow: [...allowSet],
      deny: [...denySet],
      ask: [...askSet],
      defaultMode,
    },
    hooks,
    enabledPlugins,
    mcpServers,
    language,
    model,
    extra,
  }
}

function mergePermissions(
  perms: Permissions,
  allowSet: Set<string>,
  denySet: Set<string>,
  askSet: Set<string>,
): void {
  if (perms.allow) {
    for (const item of perms.allow) {
      allowSet.add(item)
    }
  }
  if (perms.deny) {
    for (const item of perms.deny) {
      denySet.add(item)
    }
  }
  if (perms.ask) {
    for (const item of perms.ask) {
      askSet.add(item)
    }
  }
}

function mergeHooks(source: HooksMap, target: Record<string, HookRule[]>): void {
  for (const [eventType, rules] of Object.entries(source)) {
    const existing = target[eventType]
    if (existing) {
      existing.push(...rules)
    } else {
      target[eventType] = [...rules]
    }
  }
}
