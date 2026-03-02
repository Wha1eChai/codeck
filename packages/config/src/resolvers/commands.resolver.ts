import type { CommandFile } from '../schemas/command.schema.js'

interface CommandsResolverInput {
  readonly globalCommands: readonly CommandFile[]
  readonly projectCommands: readonly CommandFile[]
  readonly pluginCommands: readonly CommandFile[]
}

/**
 * Aggregate commands from global + project + plugins.
 * Project overrides global by slashName. Plugin commands added alongside.
 */
export function resolveCommands(input: CommandsResolverInput): readonly CommandFile[] {
  const byName = new Map<string, CommandFile>()

  // Global commands (lowest priority)
  for (const cmd of input.globalCommands) {
    byName.set(cmd.slashName, cmd)
  }

  // Project commands override global
  for (const cmd of input.projectCommands) {
    byName.set(cmd.slashName, cmd)
  }

  // Plugin commands don't override global/project
  const result = [...byName.values()]
  for (const cmd of input.pluginCommands) {
    if (!byName.has(cmd.slashName)) {
      result.push(cmd)
      byName.set(cmd.slashName, cmd)
    }
  }

  return result
}
