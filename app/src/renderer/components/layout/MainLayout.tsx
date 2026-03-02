import React from 'react'
import { ActivityBar } from './ActivityBar'
import { SessionPanel } from './SessionPanel'
import { FilePanel } from './FilePanel'
import { HistoryPanel } from './HistoryPanel'
import { HeaderBar } from './HeaderBar'
import { MultiSessionContainer } from '../chat/MultiSessionContainer'
import { TimelinePanel } from '../timeline/TimelinePanel'
import { SettingsPage } from '../settings/SettingsPage'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { cn } from '../../lib/utils'

export const MainLayout: React.FC = () => {
  const activeSidebarPanel = useUIStore(s => s.activeSidebarPanel)
  const activeView = useUIStore(s => s.activeView)
  const timelineOpenSessions = useUIStore(s => s.timelineOpenSessions)
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const timelineOpen = timelineOpenSessions.has(currentSessionId ?? '')

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Activity Bar — always visible, 48px */}
      <ActivityBar />

      {/* Panel — conditionally rendered based on activeSidebarPanel */}
      {activeSidebarPanel === 'sessions' && <SessionPanel />}
      {activeSidebarPanel === 'files' && <FilePanel />}
      {activeSidebarPanel === 'history' && <HistoryPanel />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeView === 'chat' ? (
          <>
            <HeaderBar />
            <div className="flex-1 min-h-0 relative flex">
              <div className="flex-1 min-w-0">
                <MultiSessionContainer />
              </div>
              {/* Timeline Panel — always mounted to preserve state and IntersectionObserver bindings */}
              <div
                className={cn(
                  "transition-all duration-300 ease-in-out border-l overflow-hidden",
                  timelineOpen ? "w-[260px]" : "w-0 pointer-events-none"
                )}
              >
                <TimelinePanel sessionId={currentSessionId ?? ''} />
              </div>
            </div>
          </>
        ) : (
          <SettingsPage />
        )}
      </div>
    </div>
  )
}
