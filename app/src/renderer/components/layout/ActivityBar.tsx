import React from 'react'
import { MessageSquare, FolderTree, Clock, Settings } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { Button } from '../ui/Button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/Tooltip'
import { cn } from '../../lib/utils'
import type { SidebarPanel } from '@common/multi-session-types'

export const ActivityBar: React.FC = () => {
  const activeSidebarPanel = useUIStore(s => s.activeSidebarPanel)
  const toggleSidebarPanel = useUIStore(s => s.toggleSidebarPanel)
  const setActiveView = useUIStore(s => s.setActiveView)
  const activeView = useUIStore(s => s.activeView)

  // Count active sessions (those that are streaming or waiting)
  const sessionStates = useSessionStore(s => s.sessionStates)
  const activeCount = Object.values(sessionStates).filter(
    s => s.status === 'streaming' || s.status === 'waiting_permission'
  ).length

  return (
    <div className="w-12 bg-muted/10 flex flex-col items-center py-2 gap-0.5 h-full border-r shrink-0">
      <ActivityIcon
        icon={<MessageSquare className="h-4.5 w-4.5" />}
        tooltip="Sessions"
        active={activeSidebarPanel === 'sessions'}
        badge={activeCount > 0 ? activeCount : undefined}
        onClick={() => toggleSidebarPanel('sessions')}
      />
      <ActivityIcon
        icon={<FolderTree className="h-4.5 w-4.5" />}
        tooltip="Files"
        active={activeSidebarPanel === 'files'}
        onClick={() => toggleSidebarPanel('files')}
      />
      <ActivityIcon
        icon={<Clock className="h-4.5 w-4.5" />}
        tooltip="History"
        active={activeSidebarPanel === 'history'}
        onClick={() => toggleSidebarPanel('history')}
      />

      <div className="flex-1" />

      <ActivityIcon
        icon={<Settings className="h-4.5 w-4.5" />}
        tooltip="Settings"
        active={activeView === 'settings'}
        onClick={() => setActiveView(activeView === 'settings' ? 'chat' : 'settings')}
      />
    </div>
  )
}

interface ActivityIconProps {
  readonly icon: React.ReactNode
  readonly tooltip: string
  readonly onClick: () => void
  readonly active?: boolean
  readonly badge?: number
}

const ActivityIcon: React.FC<ActivityIconProps> = ({ icon, tooltip, onClick, active, badge }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 rounded-lg",
            active && "bg-muted text-foreground"
          )}
          onClick={onClick}
        >
          {icon}
        </Button>
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium px-1 pointer-events-none">
            {badge}
          </span>
        )}
      </div>
    </TooltipTrigger>
    <TooltipContent side="right">{tooltip}</TooltipContent>
  </Tooltip>
)
