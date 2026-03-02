import type { LucideIcon } from 'lucide-react'

export type SettingsSection =
  | 'general'
  | 'session'
  | 'environment'
  | 'models'
  | 'structured-output'
  | 'plugins'
  | 'agents'
  | 'mcp-servers'
  | 'hooks'
  | 'memory'
  | 'usage'

export interface NavItem {
  readonly id: SettingsSection
  readonly label: string
  readonly icon: LucideIcon
  readonly hint: string
}

export interface NavGroup {
  readonly title: string
  readonly items: readonly NavItem[]
}
