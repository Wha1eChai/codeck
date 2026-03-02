import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Folder, Loader2, Search, X, ChevronRight, RefreshCw } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { useUIStore } from '../../stores/ui-store'
import { useSessionActions } from '../../hooks/useSessionActions'
import { useHistory } from '../../hooks/useHistory'
import { useRelativeTime } from '../../hooks/useRelativeTime'
import { Button } from '../ui/Button'
import { ScrollArea } from '../ui/ScrollArea'
import { cn, formatRelativeTime } from '../../lib/utils'
import type { HistoryEntry } from '@common/types'

const DEFAULT_VISIBLE_COUNT = 5

function deduplicateResumed(entries: HistoryEntry[]): HistoryEntry[] {
  const rootMap = new Map<string, HistoryEntry>()
  const standalone: HistoryEntry[] = []

  for (const entry of entries) {
    if (!entry.conversationRoot) {
      standalone.push(entry)
      continue
    }
    const existing = rootMap.get(entry.conversationRoot)
    if (!existing || entry.lastActiveAt > existing.lastActiveAt) {
      rootMap.set(entry.conversationRoot, entry)
    }
  }

  return [...rootMap.values(), ...standalone].sort(
    (a, b) => b.lastActiveAt - a.lastActiveAt,
  )
}

function groupByProject(entries: readonly HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.projectPath) ?? []
    list.push(entry)
    groups.set(entry.projectPath, list)
  }
  for (const [key, list] of groups) {
    groups.set(key, deduplicateResumed(list))
  }
  return groups
}

function projectDisplayName(projectPath: string): string {
  return projectPath.split(/[/\\]/).filter(Boolean).pop() ?? projectPath
}

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

export const HistoryPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { switchSession } = useSessionActions()
  const setActiveView = useUIStore(s => s.setActiveView)
  const setProjectPath = useSessionStore(s => s.setProjectPath)
  const setSessions = useSessionStore(s => s.setSessions)
  const addTab = useSessionStore(s => s.addTab)
  const currentSessionId = useSessionStore(s => s.currentSessionId)

  const {
    entries: historyEntries,
    isLoading: historyLoading,
    syncStatus,
    loadHistory,
    searchHistory,
    syncAndLoad,
  } = useHistory()

  const HOUR = 3_600_000
  const hasRecentEntries = useMemo(
    () => historyEntries.some(e => Date.now() - e.lastActiveAt < HOUR),
    [historyEntries],
  )
  const now = useRelativeTime(hasRecentEntries)

  useEffect(() => {
    if (historyEntries.length === 0) {
      loadHistory()
    }
  }, [historyEntries.length, loadHistory])

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      searchHistory(query)
    },
    [searchHistory],
  )

  const toggleProjectCollapse = useCallback((path: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const toggleGroupExpansion = useCallback((path: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleHistoryEntryClick = useCallback(
    async (entry: HistoryEntry) => {
      try {
        setProjectPath(entry.projectPath)
        await window.electron.notifyProjectSelected(entry.projectPath)
        const projectSessions = await window.electron.getSessions(entry.projectPath)
        setSessions([...projectSessions])
        const found = projectSessions.find(s => s.id === entry.sessionId)
        if (found) {
          await switchSession(entry.sessionId)
          setActiveView('chat')
          addTab({ sessionId: entry.sessionId, name: entry.title, status: 'idle' })
        }
      } catch (err) {
        console.error('Failed to open history session:', err)
      }
    },
    [setProjectPath, setSessions, switchSession, setActiveView, addTab],
  )

  const projectGroups = useMemo(() => groupByProject(historyEntries), [historyEntries])

  return (
    <div className="w-[220px] bg-muted/10 flex flex-col h-full border-r shrink-0">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm tracking-tight">History</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Sync & refresh"
            onClick={() => syncAndLoad()}
            disabled={syncStatus === 'syncing'}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncStatus === 'syncing' && 'animate-spin')} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search all sessions..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border bg-transparent
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => handleSearch('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {historyLoading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!historyLoading && projectGroups.size === 0 && (
            <div className="text-sm text-muted-foreground p-4 text-center space-y-2">
              <p>{searchQuery ? 'No matching sessions.' : 'No session history found.'}</p>
              {!searchQuery && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncAndLoad()}
                  disabled={syncStatus === 'syncing'}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5 mr-1', syncStatus === 'syncing' && 'animate-spin')} />
                  Sync Now
                </Button>
              )}
            </div>
          )}

          {Array.from(projectGroups.entries()).map(([projectPath, entries]) => {
            const isCollapsed = collapsedProjects.has(projectPath)
            const isExpanded = expandedGroups.has(projectPath)
            const displayName = projectDisplayName(projectPath)
            const latestTimestamp = Math.max(...entries.map(e => e.lastActiveAt))
            const visibleEntries = isExpanded ? entries : entries.slice(0, DEFAULT_VISIBLE_COUNT)
            const hiddenCount = entries.length - DEFAULT_VISIBLE_COUNT

            return (
              <div key={projectPath} className="mb-1">
                <button
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold
                             text-muted-foreground hover:text-foreground hover:bg-muted/20
                             rounded-md transition-colors"
                  onClick={() => toggleProjectCollapse(projectPath)}
                  title={projectPath}
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform duration-150',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="truncate">{displayName}</span>
                  <span className="ml-auto text-muted-foreground-subtle tabular-nums shrink-0">
                    ({entries.length})
                  </span>
                  <RelativeTimestamp
                    timestamp={latestTimestamp}
                    now={now}
                    className="text-muted-foreground-subtle shrink-0"
                  />
                </button>

                {!isCollapsed && (
                  <div className="ml-3 space-y-0.5">
                    {visibleEntries.map(entry => (
                      <div
                        key={entry.sessionId}
                        onClick={() => handleHistoryEntryClick(entry)}
                        className={cn(
                          'group flex items-center gap-2 py-2 px-3 rounded-md text-sm cursor-pointer transition-all duration-150 ease-out',
                          currentSessionId === entry.sessionId
                            ? 'bg-muted/50 text-foreground border-l-2 border-primary'
                            : 'hover:bg-muted/30 text-muted-foreground hover:text-foreground border-l-2 border-transparent',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium" title={entry.title}>
                            {entry.title}
                          </div>
                          <RelativeTimestamp
                            timestamp={entry.lastActiveAt}
                            now={now}
                            className="text-xs text-muted-foreground/50 font-mono"
                          />
                        </div>
                      </div>
                    ))}

                    {hiddenCount > 0 && (
                      <button
                        className="w-full py-1.5 text-xs text-primary/70 hover:text-primary
                                   transition-colors text-center"
                        onClick={() => toggleGroupExpansion(projectPath)}
                      >
                        {isExpanded ? 'Show less' : `Show ${hiddenCount} more...`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
