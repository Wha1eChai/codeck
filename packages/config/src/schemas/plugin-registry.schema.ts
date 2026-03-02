import { z } from 'zod'

// ── Plugin entry in installed_plugins.json ──

export const pluginEntrySchema = z
  .object({
    scope: z.enum(['user', 'workspace']),
    installPath: z.string(),
    version: z.string(),
    installedAt: z.string(),
    lastUpdated: z.string().optional(),
    gitCommitSha: z.string().optional(),
  })
  .passthrough()

export type PluginEntry = z.infer<typeof pluginEntrySchema>

// ── The full installed_plugins.json file format ──

export const installedPluginsSchema = z
  .object({
    version: z.number(),
    plugins: z.record(z.string(), z.array(pluginEntrySchema)),
  })
  .passthrough()

export type InstalledPluginsFile = z.infer<typeof installedPluginsSchema>

// ── Known marketplaces ──

export const marketplaceSourceSchema = z
  .object({
    source: z.string(),
    repo: z.string().optional(),
  })
  .passthrough()

export type MarketplaceSource = z.infer<typeof marketplaceSourceSchema>

export const marketplaceEntrySchema = z
  .object({
    source: marketplaceSourceSchema,
    installLocation: z.string().optional(),
    lastUpdated: z.string().optional(),
  })
  .passthrough()

export type MarketplaceEntry = z.infer<typeof marketplaceEntrySchema>

export const knownMarketplacesSchema = z.record(
  z.string(),
  marketplaceEntrySchema,
)

export type KnownMarketplacesFile = z.infer<typeof knownMarketplacesSchema>

// ── Blocklist ──

export const blocklistEntrySchema = z
  .object({
    plugin: z.string(),
    added_at: z.string(),
    reason: z.string(),
    text: z.string().optional(),
  })
  .passthrough()

export type BlocklistEntry = z.infer<typeof blocklistEntrySchema>

export const blocklistSchema = z
  .object({
    fetchedAt: z.string().optional(),
    plugins: z.array(blocklistEntrySchema),
  })
  .passthrough()

export type BlocklistFile = z.infer<typeof blocklistSchema>
