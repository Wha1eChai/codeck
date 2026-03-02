import React from 'react'
import {
  Settings,
  Terminal,
  Key,
  Cpu,
  Braces,
  Puzzle,
  Bot,
  Server,
  Webhook,
  BookOpen,
  BarChart3,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { SettingsSection, NavGroup } from './types'

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Preferences',
    items: [
      { id: 'general', label: 'General', icon: Settings, hint: 'App preferences' },
      { id: 'session', label: 'Session', icon: Terminal, hint: 'Execution context' },
      { id: 'environment', label: 'Environment', icon: Key, hint: 'Environment variables' },
      { id: 'models', label: 'Models', icon: Cpu, hint: 'Model alias mappings' },
      { id: 'structured-output', label: 'Structured Output', icon: Braces, hint: 'JSON Schema output' },
    ],
  },
  {
    title: 'Extensions',
    items: [
      { id: 'plugins', label: 'Plugins', icon: Puzzle, hint: 'Plugin management' },
      { id: 'agents', label: 'Agents & Skills', icon: Bot, hint: 'Agent definitions' },
      { id: 'mcp-servers', label: 'MCP Servers', icon: Server, hint: 'MCP configuration' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { id: 'hooks', label: 'Hooks', icon: Webhook, hint: 'Event hooks' },
      { id: 'memory', label: 'Memory', icon: BookOpen, hint: 'CLAUDE.md & Memory' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { id: 'usage', label: 'Usage', icon: BarChart3, hint: 'Token usage & costs' },
    ],
  },
]

interface SettingsNavProps {
  readonly activeSection: SettingsSection
  readonly onSelect: (section: SettingsSection) => void
}

export const SettingsNav: React.FC<SettingsNavProps> = ({ activeSection, onSelect }) => (
  <nav className="w-[220px] shrink-0 border-r border-border/40 py-4 overflow-y-auto">
    {NAV_GROUPS.map((group) => (
      <div key={group.title} className="mb-4">
        <h4 className="px-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {group.title}
        </h4>
        <div className="space-y-0.5 px-2">
          {group.items.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    ))}
  </nav>
)
