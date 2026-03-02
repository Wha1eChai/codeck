import React, { useCallback } from 'react'
import { Plus, X, GitBranch } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { useUIStore } from '../../stores/ui-store'
import { useSessionActions } from '../../hooks/useSessionActions'
import { cn } from '../../lib/utils'
import type { SessionTab } from '@common/multi-session-types'
import type { Session } from '@common/types'

const STATUS_COLORS: Record<string, string> = {
  streaming: 'bg-green-500',
  waiting_permission: 'bg-yellow-500',
  error: 'bg-red-500',
  idle: 'bg-muted-foreground/40',
}

const EMPTY_TABS: readonly SessionTab[] = []

export const SessionTabBar: React.FC = () => {
  const openTabs = useSessionStore(s => s.openTabs.length > 0 ? s.openTabs : EMPTY_TABS)
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const setFocusedTab = useSessionStore(s => s.setFocusedTab)
  const removeTab = useSessionStore(s => s.removeTab)
  const sessions = useSessionStore(s => s.sessions)
  const pendingInteractions = useUIStore(s => s.pendingInteractions)
  const { quickCreateSession } = useSessionActions()

  const handleTabClick = useCallback((sessionId: string) => {
    setFocusedTab(sessionId)
    // Also notify backend
    window.electron.focusSession(sessionId).catch(() => {})
  }, [setFocusedTab])

  const handleTabClose = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    removeTab(sessionId)
    window.electron.closeSessionTab(sessionId).catch(() => {})
  }, [removeTab])

  const handleMiddleClick = useCallback((e: React.MouseEvent, sessionId: string) => {
    if (e.button === 1) {
      e.preventDefault()
      removeTab(sessionId)
      window.electron.closeSessionTab(sessionId).catch(() => {})
    }
  }, [removeTab])

  if (openTabs.length === 0) {
    return null
  }

  return (
    <div className="flex items-center h-9 border-b border-border/40 bg-muted/5 overflow-x-auto shrink-0">
      <div className="flex items-center h-full min-w-0">
        {openTabs.map(tab => {
          const isActive = tab.sessionId === currentSessionId
          const hasPendingInteraction = !!pendingInteractions[tab.sessionId]
          const session: Session | undefined = sessions.find(s => s.id === tab.sessionId)
          const isWorktree = !!session?.worktree

          return (
            <button
              key={tab.sessionId}
              onClick={() => handleTabClick(tab.sessionId)}
              onMouseDown={e => handleMiddleClick(e, tab.sessionId)}
              className={cn(
                'group relative flex items-center gap-1.5 h-full px-3 text-xs border-r border-border/30 min-w-0 max-w-[180px] transition-colors',
                isActive
                  ? 'bg-background text-foreground'
                  : 'bg-muted/10 text-muted-foreground hover:bg-muted/20 hover:text-foreground',
              )}
              title={tab.name}
            >
              {/* Active indicator line */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
              )}

              {/* Status dot */}
              <span
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                  STATUS_COLORS[tab.status] ?? STATUS_COLORS.idle,
                )}
              />

              {/* Worktree indicator */}
              {isWorktree && (
                <span title={session?.worktree?.branchName}>
                  <GitBranch className="h-3 w-3 shrink-0 text-blue-500" />
                </span>
              )}

              {/* Tab name */}
              <span className="truncate">{tab.name}</span>

              {/* Pending interaction badge */}
              {hasPendingInteraction && (
                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0 animate-pulse" />
              )}

              {/* Close button */}
              <button
                onClick={e => handleTabClose(e, tab.sessionId)}
                className={cn(
                  'ml-auto shrink-0 rounded-sm p-0.5 transition-opacity',
                  isActive
                    ? 'opacity-60 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </button>
          )
        })}
      </div>

      {/* New tab button */}
      <button
        onClick={() => quickCreateSession()}
        className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors shrink-0"
        title="New session"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
