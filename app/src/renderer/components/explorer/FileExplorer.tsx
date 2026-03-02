import React, { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Folder, FileText, RefreshCw } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import type { FileEntry } from '@common/types'

interface TreeNodeProps {
    entry: FileEntry
    depth: number
}

const TreeNode: React.FC<TreeNodeProps> = ({ entry, depth }) => {
    const [expanded, setExpanded] = useState(false)
    const [children, setChildren] = useState<readonly FileEntry[]>([])
    const [loading, setLoading] = useState(false)

    const toggleExpand = async () => {
        if (!entry.isDirectory) return

        if (!expanded) {
            setLoading(true)
            try {
                const entries = await window.electron.listDirectory(entry.path)
                setChildren(entries)
            } catch {
                setChildren([])
            } finally {
                setLoading(false)
            }
        }
        setExpanded(!expanded)
    }

    return (
        <div>
            <button
                className={cn(
                    "w-full flex items-center gap-1.5 py-1 px-2 text-xs hover:bg-accent/50 rounded transition-colors text-left",
                    "text-muted-foreground hover:text-foreground"
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={toggleExpand}
            >
                {entry.isDirectory ? (
                    expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )
                ) : (
                    <span className="w-3.5" />
                )}

                {entry.isDirectory ? (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
                ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                )}

                <span className="truncate">{entry.name}</span>

                {loading && (
                    <RefreshCw className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
                )}
            </button>

            {expanded && children.length > 0 && (
                <div>
                    {children.map(child => (
                        <TreeNode key={child.path} entry={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

export const FileExplorer: React.FC = () => {
    const [entries, setEntries] = useState<readonly FileEntry[]>([])
    const [loading, setLoading] = useState(false)

    const currentSession = useSessionStore(s => {
        if (!s.currentSessionId) return undefined
        return s.sessions.find(sess => sess.id === s.currentSessionId)
    })

    const projectPath = currentSession?.projectPath

    const loadRoot = useCallback(async () => {
        if (!projectPath) {
            setEntries([])
            return
        }
        setLoading(true)
        try {
            const result = await window.electron.listDirectory(projectPath)
            setEntries(result)
        } catch {
            setEntries([])
        } finally {
            setLoading(false)
        }
    }, [projectPath])

    useEffect(() => {
        loadRoot()
    }, [loadRoot])

    if (!projectPath) {
        return (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
                No project selected
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-medium text-muted-foreground truncate">
                    {projectPath.split(/[/\\]/).pop()}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={loadRoot}
                    title="Refresh"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
                {loading && entries.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                        Loading...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                        Empty directory
                    </div>
                ) : (
                    entries.map(entry => (
                        <TreeNode key={entry.path} entry={entry} depth={0} />
                    ))
                )}
            </div>
        </div>
    )
}
