import { z } from 'zod'

export const agentFrontmatterSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    'allowed-tools': z.union([z.array(z.string()), z.string()]).optional(),
  })
  .passthrough()

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>

export type AgentScope = 'global' | 'project' | 'plugin'

export interface AgentFile {
  readonly filename: string
  readonly filePath: string
  readonly scope: AgentScope
  readonly pluginId: string | undefined
  readonly name: string
  readonly frontmatter: AgentFrontmatter
  readonly body: string
}
