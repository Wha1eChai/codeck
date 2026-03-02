import React from 'react'
import { History, Sun, Moon, Monitor, Flame } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { useSettingsStore } from '../../stores/settings-store'
import { Button } from '../ui/Button'
import type { AppPreferences } from '@common/types'
import { cn } from '../../lib/utils'
import { TokenUsageBadge } from './TokenUsageBadge'
import { ProjectSwitcherDropdown } from './ProjectSwitcherDropdown'

const THEME_CYCLE: AppPreferences['theme'][] = ['light', 'dark', 'warm', 'system']
const THEME_ICON: Record<AppPreferences['theme'], React.ReactNode> = {
  light: <Sun className="h-4.5 w-4.5" />,
  dark: <Moon className="h-4.5 w-4.5" />,
  warm: <Flame className="h-4.5 w-4.5" />,
  system: <Monitor className="h-4.5 w-4.5" />,
}
const THEME_LABEL: Record<AppPreferences['theme'], string> = {
  light: 'Light',
  dark: 'Dark',
  warm: 'Warm',
  system: 'System',
}

export const HeaderBar: React.FC = () => {
  const theme = useSettingsStore(s => s.settings.theme)
  const updateSettings = useSettingsStore(s => s.updateSettings)
  const toggleTimeline = useUIStore(s => s.toggleTimeline)
  const timelineOpenSessions = useUIStore(s => s.timelineOpenSessions)
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const timelineOpen = timelineOpenSessions.has(currentSessionId ?? '')

  const handleThemeToggle = () => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    updateSettings({ theme: next })
  }

  return (
    <div className="h-11 border-b border-border/40 flex items-center justify-between px-4 bg-background/95 backdrop-blur z-10 relative">
      <div className="flex items-center gap-2">
        <ProjectSwitcherDropdown />
      </div>

      <div className="flex items-center gap-2">
        <TokenUsageBadge />
        <Button variant="ghost" size="icon" onClick={() => currentSessionId && toggleTimeline(currentSessionId)} title="Toggle Timeline">
          <History className={cn('h-5 w-5', timelineOpen && 'text-primary')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleThemeToggle}
          title={`Theme: ${THEME_LABEL[theme]}`}
        >
          {THEME_ICON[theme]}
        </Button>
      </div>
    </div>
  )
}
