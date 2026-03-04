import React from 'react'
import { Terminal, Sparkles, Bot } from 'lucide-react'
import type { PaletteItem, CommandCategory } from '@renderer/lib/command-palette'
import { cn } from '@renderer/lib/utils'

interface Props {
  readonly items: readonly PaletteItem[]
  readonly selectedIndex: number
  readonly onSelect: (item: PaletteItem) => void
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  command: 'Commands',
  skill: 'Skills',
  agent: 'Agents',
}

const CATEGORY_ICONS: Record<CommandCategory, React.ReactNode> = {
  command: <Terminal className="h-3 w-3 opacity-60" />,
  skill: <Sparkles className="h-3 w-3 opacity-60" />,
  agent: <Bot className="h-3 w-3 opacity-60" />,
}

export const CommandPaletteDropdown: React.FC<Props> = ({ items, selectedIndex, onSelect }) => {
  if (items.length === 0) return null

  // Group by category preserving insertion order
  const groups: { category: CommandCategory; entries: { item: PaletteItem; globalIndex: number }[] }[] = []
  let currentCategory: CommandCategory | null = null
  let flatIndex = 0

  for (const item of items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category
      groups.push({ category: item.category, entries: [] })
    }
    groups[groups.length - 1].entries.push({ item, globalIndex: flatIndex++ })
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-h-72 overflow-y-auto bg-popover border rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2">
      {groups.map((group) => (
        <div key={group.category}>
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 border-b border-border/30">
            {CATEGORY_LABELS[group.category]}
          </div>
          {group.entries.map(({ item, globalIndex }) => (
            <button
              key={item.id}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2',
                globalIndex === selectedIndex && 'bg-accent',
              )}
              onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
            >
              {CATEGORY_ICONS[item.category]}
              <span className="font-mono font-medium text-primary">{item.label}</span>
              {item.description && <span className="ml-auto text-xs text-muted-foreground">{item.description}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
