import React, { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, FolderOpen, Loader2, Search, X, GitBranch, GitMerge } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { useUIStore } from '../../stores/ui-store'
import { useSessionActions } from '../../hooks/useSessionActions'
import { useRelativeTime } from '../../hooks/useRelativeTime'
import { Button } from '../ui/Button'
import { ScrollArea } from '../ui/ScrollArea'
import { cn, formatRelativeTime } from '../../lib/utils'
import { ProjectSwitcherDropdown } from './ProjectSwitcherDropdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog'

const STATUS_COLORS: Record<string, string> = {
  streaming: 'bg-green-500',
  waiting_permission: 'bg-yellow-500',
  error: 'bg-red-500',
  idle: 'bg-muted-foreground/30',
}

const StatusDot: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={cn('inline-block w-2 h-2 rounded-full shrink-0', STATUS_COLORS[status] ?? STATUS_COLORS.idle)}
    title={status}
  />
)

const RelativeTimestamp: React.FC<{
  timestamp: number
  now: number
  className?: string
}> = ({ timestamp, now, className }) => {
  const [relativeText, fullDate] = formatRelativeTime(timestamp, now)
  return (
    <span className={className} title={fullDate}>
      {relativeText}
    </span>
  )
}

export const SessionPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const {
    sessions,
    currentSessionId,
    switchSession,
    deleteSession,
    loading,
  } = useSessionActions()

  const setActiveView = useUIStore(s => s.setActiveView)
  const { quickCreateSession } = useSessionActions()
  const projectPath = useSessionStore(s => s.projectPath)
  const sessionStates = useSessionStore(s => s.sessionStates)
  const addTab = useSessionStore(s => s.addTab)

  // Smart relative time
  const HOUR = 3_600_000
  const hasRecentSessions = useMemo(
    () => sessions.some(s => Date.now() - s.updatedAt < HOUR),
    [sessions],
  )
  const now = useRelativeTime(hasRecentSessions)

  const handleSessionClick = useCallback((sessionId: string, sessionName: string) => {
    switchSession(sessionId)
    setActiveView('chat')
    const status = sessionStates[sessionId]?.status ?? 'idle'
    addTab({ sessionId, name: sessionName, status })
  }, [switchSession, setActiveView, sessionStates, addTab])

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setDeleteTarget(sessionId)
  }

  const confirmDelete = async () => {
    if (deleteTarget) {
      await deleteSession(deleteTarget)
      setDeleteTarget(null)
    }
  }

  const filteredSessions = searchQuery
    ? sessions.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions

  // Count active (running) sessions
  const runningCount = Object.values(sessionStates).filter(
    s => s.status === 'streaming' || s.status === 'waiting_permission'
  ).length
  const totalActive = Object.keys(sessionStates).length

  return (
    <div className="w-[220px] bg-muted/10 flex flex-col h-full border-r shrink-0">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0">
            <ProjectSwitcherDropdown />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => quickCreateSession()}
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter sessions..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border bg-transparent
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* ACTIVE section */}
          {totalActive > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {runningCount}/{totalActive}
                </span>
              </div>
              <div className="space-y-0.5">
                {Object.values(sessionStates).map(activeState => {
                  const session = sessions.find(s => s.id === activeState.sessionId)
                  if (!session) return null
                  return (
                    <div
                      key={activeState.sessionId}
                      onClick={() => handleSessionClick(session.id, session.name)}
                      className={cn(
                        'group flex items-center gap-2 py-2 px-3 rounded-md text-sm cursor-pointer transition-all duration-150 ease-out',
                        currentSessionId === session.id
                          ? 'bg-primary/10 text-foreground border-l-2 border-primary'
                          : 'hover:bg-muted/30 text-muted-foreground hover:text-foreground border-l-2 border-transparent',
                      )}
                    >
                      <StatusDot status={activeState.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          {session.worktree && (
                            <GitBranch className="h-3 w-3 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate text-sm font-medium" title={session.name}>
                            {session.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* RECENT section */}
          <div>
            <div className="px-2 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </span>
            </div>

            {filteredSessions.length === 0 && (
              <div className="text-sm text-muted-foreground p-4 text-center space-y-2">
                {searchQuery ? (
                  <p>No matching sessions.</p>
                ) : !projectPath ? (
                  <>
                    <p>No project selected.</p>
                    <p className="text-xs">Use the project switcher above to open a project.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const dir = await window.electron.selectDirectory()
                        if (dir) {
                          await window.electron.notifyProjectSelected(dir)
                        }
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5 mr-1" /> Open Folder
                    </Button>
                  </>
                ) : (
                  <p>No sessions yet.<br />Create one to start coding.</p>
                )}
              </div>
            )}

            <div className="space-y-0.5">
              {filteredSessions
                .filter(s => !sessionStates[s.id]) // Skip already shown in ACTIVE
                .map(session => (
                <div
                  key={session.id}
                  onClick={() => handleSessionClick(session.id, session.name)}
                  className={cn(
                    'group flex items-center gap-2 py-2 px-3 rounded-md text-sm cursor-pointer transition-all duration-150 ease-out',
                    currentSessionId === session.id
                      ? 'bg-muted/50 text-foreground border-l-2 border-primary'
                      : 'hover:bg-muted/30 text-muted-foreground hover:text-foreground border-l-2 border-transparent',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      {loading && currentSessionId === session.id && (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      )}
                      {session.worktree && (
                        <GitBranch className="h-3 w-3 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate text-sm font-medium" title={session.name}>
                        {session.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RelativeTimestamp
                        timestamp={session.updatedAt}
                        now={now}
                        className="text-xs text-muted-foreground/50 font-mono"
                      />
                      {session.worktree && (
                        <span className="text-[10px] text-blue-500/70 font-mono truncate" title={session.worktree.branchName}>
                          {session.worktree.branchName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {session.worktree && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => {
                          e.stopPropagation()
                          handleSessionClick(session.id, session.name)
                        }}
                        title="Review & Merge"
                      >
                        <GitMerge className="h-3 w-3 text-blue-500" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => handleDelete(e, session.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
