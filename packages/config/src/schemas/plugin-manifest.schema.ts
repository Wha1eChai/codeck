import { z } from 'zod'

// ── Plugin author ──

export const pluginAuthorSchema = z
  .object({
    name: z.string(),
    email: z.string().optional(),
  })
  .passthrough()

export type PluginAuthor = z.infer<typeof pluginAuthorSchema>

// ── plugin.json inside .claude-plugin/ ──

export const pluginManifestSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
    author: pluginAuthorSchema.optional(),
  })
  .passthrough()

export type PluginManifest = z.infer<typeof pluginManifestSchema>
