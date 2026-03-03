import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { FolderOpen, ChevronDown, Check, Loader2, FolderKanban, Search, X } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useSessionStore } from '../../stores/session-store'
import { useRelativeTime } from '../../hooks/useRelativeTime'
import { cn, formatRelativeTime } from '../../lib/utils'
import type { ProjectInfo } from '@common/types'

const HOUR = 3_600_000

function projectDisplayName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

export const ProjectSwitcherDropdown: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<readonly ProjectInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const projectPath = useSessionStore(s => s.projectPath)
  const setProjectPath = useSessionStore(s => s.setProjectPath)
  const setSessions = useSessionStore(s => s.setSessions)

  const currentProjectName = projectPath ? projectDisplayName(projectPath) : null

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.scanProjects()
      setProjects(result)
    } catch (err) {
      console.error('Failed to scan projects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadProjects()
      // Auto-focus search after dropdown animates in
      setTimeout(() => searchRef.current?.focus(), 50)
    } else {
      setSearchQuery('')
    }
  }, [open, loadProjects])

  const handleSelect = useCallback(async (path: string) => {
    try {
      setProjectPath(path)
      await window.electron.notifyProjectSelected(path)
      const sessions = await window.electron.getSessions(path)
      setSessions([...sessions])
      setOpen(false)
    } catch (err) {
      console.error('Failed to select project:', err)
    }
  }, [setProjectPath, setSessions])

  const handleBrowse = useCallback(async () => {
    try {
      const dir = await window.electron.selectDirectory()
      if (dir) {
        await handleSelect(dir)
      }
    } catch (err) {
      console.error('Failed to open folder:', err)
    }
  }, [handleSelect])

  // Deduplicate projects by path (data source may contain duplicates)
  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>()
    return projects.filter(p => {
      if (seen.has(p.path)) return false
      seen.add(p.path)
      return true
    })
  }, [projects])

  const hasRecentProjects = useMemo(
    () => uniqueProjects.some(p => Date.now() - p.lastAccessed < HOUR),
    [uniqueProjects],
  )
  const now = useRelativeTime(hasRecentProjects)

  // Filter projects by search query (name or full path)
  const filteredProjects = useMemo(() => {
    if (!searchQuery) return uniqueProjects
    const q = searchQuery.toLowerCase()
    return uniqueProjects.filter(p => {
      const name = projectDisplayName(p.path).toLowerCase()
      return name.includes(q) || p.path.toLowerCase().includes(q)
    })
  }, [uniqueProjects, searchQuery])

  const currentProject = useMemo(
    () => projects.find(p => p.path === projectPath),
    [projects, projectPath],
  )

  // When searching: show all matched (including current) in a flat list
  // When not searching: show Current section + All Projects section
  const isSearching = searchQuery.length > 0
  const filteredOthers = useMemo(
    () => filteredProjects.filter(p => p.path !== projectPath),
    [filteredProjects, projectPath],
  )
  const filteredCurrent = useMemo(
    () => filteredProjects.find(p => p.path === projectPath),
    [filteredProjects, projectPath],
  )

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            open && 'bg-muted/60 text-foreground',
          )}
          title={projectPath ?? 'Select a project'}
        >
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[160px] truncate font-medium">
            {currentProjectName ?? 'Select Project'}
          </span>
          <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[260px] max-w-[340px] rounded-lg border bg-popover shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          // Prevent dropdown from closing on interaction with inner elements
          onCloseAutoFocus={e => e.preventDefault()}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border bg-transparent
                           placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                // Prevent DropdownMenu from handling keyboard events in the input
                onKeyDown={e => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : isSearching ? (
            /* ── Search results: flat list ── */
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredCurrent && (
                <ProjectMenuItem
                  project={filteredCurrent}
                  isCurrent
                  now={now}
                  onSelect={() => handleSelect(filteredCurrent.path)}
                />
              )}
              {filteredOthers.map(project => (
                <ProjectMenuItem
                  key={project.path}
                  project={project}
                  isCurrent={false}
                  now={now}
                  onSelect={() => handleSelect(project.path)}
                />
              ))}
              {filteredProjects.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No matching projects.
                </div>
              )}
            </div>
          ) : (
            /* ── Default: sectioned list ── */
            <>
              {currentProject && (
                <>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Current
                    </span>
                  </div>
                  <ProjectMenuItem
                    project={currentProject}
                    isCurrent
                    now={now}
                    onSelect={() => handleSelect(currentProject.path)}
                  />
                  {filteredOthers.length > 0 && (
                    <DropdownMenu.Separator className="my-1 border-t border-border/50" />
                  )}
                </>
              )}

              {filteredOthers.length > 0 && (
                <>
                  <div className="px-3 pt-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {currentProject ? 'All Projects' : 'Projects'}
                    </span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {filteredOthers.map(project => (
                      <ProjectMenuItem
                        key={project.path}
                        project={project}
                        isCurrent={false}
                        now={now}
                        onSelect={() => handleSelect(project.path)}
                      />
                    ))}
                  </div>
                </>
              )}

              {!currentProject && filteredOthers.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground space-y-1">
                  <p>No projects found.</p>
                  <p className="text-xs">Run Claude CLI in your project directory first.</p>
                </div>
              )}
            </>
          )}

          {/* Browse action */}
          <DropdownMenu.Separator className="my-1 border-t border-border/50" />
          <DropdownMenu.Item
            onSelect={handleBrowse}
            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-sm
                       text-muted-foreground hover:text-foreground hover:bg-muted/50
                       focus:outline-none focus:bg-muted/50 m-1"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            Open Folder...
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Project menu item ──

interface ProjectMenuItemProps {
  readonly project: ProjectInfo
  readonly isCurrent: boolean
  readonly now: number
  readonly onSelect: () => void
}

const ProjectMenuItem: React.FC<ProjectMenuItemProps> = ({ project, isCurrent, now, onSelect }) => {
  const [relativeText, fullDate] = formatRelativeTime(project.lastAccessed, now)
  const displayName = projectDisplayName(project.path)

  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-sm mx-1',
        'focus:outline-none focus:bg-muted/50',
        isCurrent
          ? 'text-foreground bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium" title={project.path}>
            {displayName}
          </span>
          {isCurrent && <Check className="h-3 w-3 text-primary shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <span className="tabular-nums">{project.sessionCount} sessions</span>
          <span className="font-mono" title={fullDate}>{relativeText}</span>
        </div>
      </div>
    </DropdownMenu.Item>
  )
}
