import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Folder, Clock, Hash, ChevronRight } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { createLogger } from '../../lib/logger'
import { ProjectInfo } from '@common/types'

const logger = createLogger('ProjectSelector')

export function ProjectSelector() {
    const isOpen = useUIStore((state) => state.isProjectSelectorOpen)
    const setOpen = useUIStore((state) => state.setProjectSelectorOpen)
    const setProjectPath = useSessionStore((state) => state.setProjectPath)

    const [projects, setProjects] = useState<readonly ProjectInfo[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            loadProjects()
        }
    }, [isOpen])

    const loadProjects = async () => {
        setIsLoading(true)
        try {
            const data = await window.electron.scanProjects()
            // Sort by last accessed (most recent first)
            const sorted = [...data].sort((a, b) => b.lastAccessed - a.lastAccessed)
            setProjects(sorted)
        } catch (error) {
            logger.error('Failed to scan projects:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSelect = async (path: string) => {
        setProjectPath(path)
        await window.electron.notifyProjectSelected(path)
        // After selection, we close the dialog. 
        // The Sidebar or other components will react to the projectPath change if needed,
        // although getSessions might need manual refresh or we rely on backend push if implemented.
        setOpen(false)
    }

    return (
        <Dialog.Root open={isOpen} onOpenChange={setOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-50 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
                        <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <Folder className="w-5 h-5 text-blue-500" />
                            Browse Projects
                        </Dialog.Title>
                        <Dialog.Close className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                            <X className="w-5 h-5 text-zinc-500" />
                        </Dialog.Close>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
                                <p>Scanning for projects...</p>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 opacity-60">
                                <Folder className="w-12 h-12 mb-4 stroke-[1.5]" />
                                <p>No projects found</p>
                                <p className="text-sm">Try opening a directory manually first</p>
                            </div>
                        ) : (
                            <div className="grid gap-1">
                                {projects.map((project) => (
                                    <button
                                        key={project.path}
                                        onClick={() => handleSelect(project.path)}
                                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group text-left border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                {project.path.split(/[\\/]/).pop() || project.path}
                                            </div>
                                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                                                {project.path}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                                                    <Hash className="w-3 h-3" />
                                                    {project.sessionCount} {project.sessionCount === 1 ? 'Session' : 'Sessions'}
                                                </span>
                                                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(project.lastAccessed).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-zinc-300 dark:text-zinc-700 group-hover:text-blue-500 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 text-center">
                        <p className="text-xs text-zinc-500">
                            Projects are automatically discovered based on your recent activity
                        </p>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
