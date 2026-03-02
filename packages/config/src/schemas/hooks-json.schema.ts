import { z } from 'zod'
import { hooksMapSchema } from './settings.schema.js'

// ── hooks.json inside plugin hooks/ directory ──

export const hooksJsonFileSchema = z
  .object({
    description: z.string().optional(),
    hooks: hooksMapSchema,
  })
  .passthrough()

export type HooksJsonFile = z.infer<typeof hooksJsonFileSchema>
