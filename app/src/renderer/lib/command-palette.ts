import type { SessionMetadata } from '@common/types'

export type CommandCategory = 'command' | 'skill' | 'agent'

export interface PaletteItem {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly category: CommandCategory
  readonly insertText: string
}

const BUILTIN_COMMANDS: readonly PaletteItem[] = [
  { id: 'cmd_compact', label: '/compact', description: 'Compact conversation context', category: 'command', insertText: '/compact' },
  { id: 'cmd_clear', label: '/clear', description: 'Clear conversation context', category: 'command', insertText: '/clear' },
]

export function buildPaletteItems(metadata: SessionMetadata | undefined): readonly PaletteItem[] {
  const items: PaletteItem[] = [...BUILTIN_COMMANDS]

  if (metadata?.slashCommands) {
    for (const cmd of metadata.slashCommands) {
      const insertText = cmd.startsWith('/') ? cmd : `/${cmd}`
      if (!items.some(i => i.insertText === insertText)) {
        items.push({ id: `cmd_${cmd}`, label: insertText, category: 'command', insertText })
      }
    }
  }

  if (metadata?.skills) {
    for (const skill of metadata.skills) {
      items.push({ id: `skill_${skill}`, label: `/${skill}`, description: 'Skill', category: 'skill', insertText: `/${skill}` })
    }
  }

  if (metadata?.agents) {
    for (const agent of metadata.agents) {
      items.push({ id: `agent_${agent}`, label: agent, description: 'Agent', category: 'agent', insertText: `@${agent} ` })
    }
  }

  return items
}

export function filterPaletteItems(items: readonly PaletteItem[], query: string): readonly PaletteItem[] {
  const lower = query.toLowerCase().replace(/^[/@]/, '')
  if (!lower) return [...items]
  return items.filter(item =>
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}
