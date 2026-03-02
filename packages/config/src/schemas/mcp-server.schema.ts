import { z } from 'zod'
import { mcpServerConfigSchema } from './settings.schema.js'

// ── MCP server entry with source tracking ──

export const mcpServerEntrySchema = z.object({
  name: z.string(),
  config: mcpServerConfigSchema,
  scope: z.enum(['user', 'project', 'local']),
  source: z.string(), // 'settings' | 'plugin:<pluginId>'
  pluginId: z.string().optional(),
})

export type McpServerEntry = z.infer<typeof mcpServerEntrySchema>
