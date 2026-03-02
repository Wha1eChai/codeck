import { z } from 'zod'

export const skillFrontmatterSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough()

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>

export type SkillScope = 'global' | 'plugin'

export interface SkillFile {
  readonly name: string
  readonly dirPath: string
  readonly scope: SkillScope
  readonly pluginId: string | undefined
  readonly frontmatter: SkillFrontmatter
  readonly body: string
}
