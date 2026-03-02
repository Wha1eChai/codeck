import { z } from 'zod'

export const commandFrontmatterSchema = z
  .object({
    description: z.string().optional(),
    'allowed-tools': z.union([z.array(z.string()), z.string()]).optional(),
    'argument-hint': z.string().optional(),
    'disable-model-invocation': z.union([z.boolean(), z.string()]).optional(),
  })
  .passthrough()

export type CommandFrontmatter = z.infer<typeof commandFrontmatterSchema>

export type CommandScope = 'global' | 'project' | 'plugin'

export interface CommandTokens {
  readonly hasArguments: boolean
  readonly shellTokens: readonly string[]
  readonly hasPluginRoot: boolean
}

export interface CommandFile {
  readonly slashName: string
  readonly filePath: string
  readonly scope: CommandScope
  readonly pluginId: string | undefined
  readonly frontmatter: CommandFrontmatter
  readonly body: string
  readonly tokens: CommandTokens
}
