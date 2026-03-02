import React, { useState, useMemo } from 'react'
import { RotateCcw, MessageSquare, Terminal, Zap, AlertCircle, Archive, ChevronDown, ChevronRight, X, Loader2 } from 'lucide-react'
import { useMessageStore } from '../../stores/message-store'
import { useUIStore } from '../../stores/ui-store'
import type { Message, RewindFilesResult } from '@common/types'
import { reduceConversation } from '@renderer/lib/conversation-reducer'
import type { ConversationGroupView } from '@renderer/lib/conversation-reducer'
import { useVisibleGroupId } from '../../hooks/useTimelineSync'
import { cn } from '../../lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/Dialog'
import { Button } from '../ui/Button'

/** Stable empty array to avoid new references in Zustand selectors. */
const EMPTY_MESSAGES: Message[] = []

/**
 * 判断消息 ID 是否可能是 SDK 真实 ID（非乐观前端 ID）。
 * 乐观 ID 格式：user_${timestamp}_${random} — 由 useClaude.ts 在发消息时本地生成。
 * SDK 真实用户消息 ID 来自 JSONL replay，通常是 UUID 或 sdk_xxx 格式。
 * 只有 SDK 真实 ID 才能被 rewindFiles 识别。
 */
function isLikelyRewindableId(id: string): boolean {
    return !id.startsWith('user_')
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function truncate(text: string, max = 60): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text
}

/** Derive a short label for a conversation group. */
function buildTurnLabel(group: ConversationGroupView): string {
    if (group.kind === 'user') {
        const content = group.messages[0]?.content ?? ''
        return truncate(typeof content === 'string' ? content : JSON.stringify(content))
    }
    if (group.kind === 'assistant') {
        const textStep = group.assistant.textSteps[0]
        if (textStep?.content) return truncate(textStep.content)
        const n = group.assistant.toolSteps.length
        if (n > 0) return `${n} tool call${n > 1 ? 's' : ''}`
        return '(thinking)'
    }
    // system
    const msg = group.messages[0]
    if (!msg) return 'System'
    if (msg.type === 'compact') return 'Context compacted'
    if (msg.type === 'error') return truncate(typeof msg.content === 'string' ? msg.content : 'Error')
    return 'System event'
}

/** Build a semantic label for a single tool_use message. */
function buildToolLabel(msg: Message): string {
    const name = msg.toolName ?? 'Tool'
    const input = msg.toolInput
    if (!input) return name

    if (typeof input.file_path === 'string') {
        const file = input.file_path.split(/[/\\]/).pop() ?? input.file_path
        return `${name}: ${file}`
    }
    if (typeof input.command === 'string') {
        const cmd = input.command.trim()
        const short = cmd.length > 28 ? cmd.slice(0, 28) + '…' : cmd
        return `${name}: ${short}`
    }
    return name
}

/** Color and icon for each turn kind. */
function getTurnStyle(group: ConversationGroupView): { color: string; Icon: React.FC<{ className?: string }> } {
    if (group.kind === 'user') return { color: 'text-blue-400', Icon: MessageSquare }
    if (group.kind === 'assistant') return { color: 'text-purple-400', Icon: Zap }
    // system
    const type = group.messages[0]?.type
    if (type === 'error') return { color: 'text-red-400', Icon: AlertCircle }
    if (type === 'compact') return { color: 'text-cyan-400', Icon: Archive }
    return { color: 'text-muted-foreground', Icon: MessageSquare }
}

// ── TimelinePanel ──────────────────────────────────────────

interface TimelinePanelProps {
    /** The session this timeline belongs to. Used for explicit rewindFiles routing. */
    sessionId: string
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({ sessionId }) => {
    const messages = useMessageStore(s => sessionId ? s.messages[sessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
    const toggleTimeline = useUIStore(s => s.toggleTimeline)
    const chatScrollContainer = useUIStore(s => s.chatScrollContainer)

    const [rewindTarget, setRewindTarget] = useState<string | null>(null)
    const [preview, setPreview] = useState<RewindFilesResult | null>(null)
    const [isRewinding, setIsRewinding] = useState(false)
    const [rewindDialogOpen, setRewindDialogOpen] = useState(false)
    const [expandedTurns, setExpandedTurns] = useState<ReadonlySet<string>>(new Set())

    const groups = useMemo(() => reduceConversation(messages), [messages])
    const visibleGroupId = useVisibleGroupId(chatScrollContainer)

    const toggleTurn = (key: string) => {
        setExpandedTurns(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const scrollToGroup = (key: string) => {
        const el = document.querySelector(`[data-group-id="${key}"]`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('flash-highlight')
        const onEnd = () => { el.classList.remove('flash-highlight'); el.removeEventListener('animationend', onEnd) }
        el.addEventListener('animationend', onEnd)
    }

    const handleRewindPreview = async (userMessageId: string) => {
        setRewindTarget(userMessageId)
        setPreview(null)
        setRewindDialogOpen(true)
        try {
            const result = await window.electron.rewindFiles(sessionId, userMessageId, true)
            setPreview(result)
        } catch {
            setPreview({ canRewind: false, error: 'Failed to preview rewind' })
        }
    }

    const handleRewindConfirm = async () => {
        if (!rewindTarget) return
        setIsRewinding(true)
        try {
            await window.electron.rewindFiles(sessionId, rewindTarget, false)
        } finally {
            setIsRewinding(false)
            setRewindTarget(null)
            setPreview(null)
            setRewindDialogOpen(false)
        }
    }

    const handleRewindCancel = () => {
        setRewindTarget(null)
        setPreview(null)
        setRewindDialogOpen(false)
    }

    const header = (
        <div className="h-10 border-b flex items-center justify-between px-3 shrink-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timeline</span>
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{groups.length} turns</span>
                <button onClick={() => toggleTimeline(sessionId)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    )

    if (groups.length === 0) {
        return (
            <div className="h-full flex flex-col bg-background">
                {header}
                <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-xs text-muted-foreground text-center">No messages yet. Start a conversation to see the timeline.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {header}

            {/* Turn list */}
            <div className="flex-1 overflow-y-auto">
                <div className="py-2">
                    {groups.map((group, i) => {
                        const { color, Icon } = getTurnStyle(group)
                        const label = buildTurnLabel(group)
                        const ts = group.messages[0]?.timestamp ?? 0
                        const isLast = i === groups.length - 1
                        const isExpanded = expandedTurns.has(group.key)

                        // Tool steps available to expand (assistant groups only)
                        const toolSteps = group.kind === 'assistant' ? group.assistant.toolSteps : []
                        const hasTools = toolSteps.length > 0

                        // Rewind eligibility: only user turns with SDK-real IDs
                        const firstMsgId = group.messages[0]?.id ?? ''
                        const canRewind = group.kind === 'user' && isLikelyRewindableId(firstMsgId)
                        const isRewindTarget = rewindTarget === firstMsgId

                        return (
                            <div key={group.key} className="relative">
                                {/* Connector line — based on groups array index, no filter gaps */}
                                {!isLast && (
                                    <div className="absolute left-[19px] top-6 bottom-0 w-px bg-border pointer-events-none" />
                                )}

                                {/* Turn header row */}
                                <button
                                    className={cn(
                                        'w-full flex items-start gap-2 px-3 py-1.5 hover:bg-accent/50 transition-colors text-left',
                                        isRewindTarget && 'bg-amber-500/5',
                                        group.key === visibleGroupId && !isRewindTarget && 'bg-primary/5 border-l-2 border-primary'
                                    )}
                                    onClick={() => {
                                        scrollToGroup(group.key)
                                        if (hasTools) toggleTurn(group.key)
                                    }}
                                >
                                    {/* Dot */}
                                    <div className={cn('mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center', color)}>
                                        <Icon className="h-2.5 w-2.5" />
                                    </div>

                                    {/* Label + time */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className={cn('text-[11px] font-medium truncate', color)}>
                                                {label}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                                {ts ? formatTime(ts) : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expand chevron for tool steps */}
                                    {hasTools && (
                                        isExpanded
                                            ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                            : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                    )}
                                </button>

                                {/* Expanded tool steps */}
                                {isExpanded && hasTools && (
                                    <div className="pl-9 pr-3 pb-1 space-y-0.5">
                                        {toolSteps.map(step => {
                                            const msg = step.useMessage ?? step.resultMessage
                                            const toolLabel = msg ? buildToolLabel(msg) : step.toolName
                                            const statusColor =
                                                step.status === 'failed' ? 'text-red-400' :
                                                step.status === 'running' ? 'text-amber-400' :
                                                'text-muted-foreground'
                                            return (
                                                <div key={step.id} className="flex items-center gap-1">
                                                    <Terminal className="h-2.5 w-2.5 text-amber-400 flex-shrink-0" />
                                                    <span className={cn('text-[10px] truncate', statusColor)}>
                                                        {toolLabel}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Rewind button — only for eligible user turns */}
                                {canRewind && (
                                    <div className="pl-9 pr-3 pb-1">
                                        <button
                                            onClick={() => handleRewindPreview(firstMsgId)}
                                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-amber-400 transition-colors"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                            <span>Rewind files to here</span>
                                        </button>
                                    </div>
                                )}

                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Rewind Confirmation Dialog */}
            <Dialog open={rewindDialogOpen} onOpenChange={(open) => { if (!open) handleRewindCancel() }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-amber-400" />
                            Rewind Files
                        </DialogTitle>
                        <DialogDescription>
                            Review the changes before rewinding files to this checkpoint.
                        </DialogDescription>
                    </DialogHeader>

                    {!preview && (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading preview…</span>
                        </div>
                    )}

                    {preview && !preview.canRewind && (
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm">
                            <p className="text-destructive font-medium">Cannot rewind</p>
                            <p className="text-muted-foreground mt-1">{preview.error || 'Unknown error'}</p>
                        </div>
                    )}

                    {preview && preview.canRewind && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-sm">
                                {preview.filesChanged && preview.filesChanged.length > 0 && (
                                    <span className="text-muted-foreground">{preview.filesChanged.length} file(s) will be changed</span>
                                )}
                                {(preview.insertions !== undefined || preview.deletions !== undefined) && (
                                    <span>
                                        <span className="text-green-400 font-mono">+{preview.insertions ?? 0}</span>{' '}
                                        <span className="text-red-400 font-mono">-{preview.deletions ?? 0}</span>
                                    </span>
                                )}
                            </div>
                            {preview.filesChanged && preview.filesChanged.length > 0 && (
                                <ul className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-0.5">
                                    {preview.filesChanged.map((f) => (
                                        <li key={f} className="truncate font-mono text-xs text-muted-foreground">{f}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={handleRewindCancel} disabled={isRewinding}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRewindConfirm}
                            disabled={isRewinding || !preview?.canRewind}
                            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
                        >
                            {isRewinding ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Rewinding…
                                </>
                            ) : 'Confirm Rewind'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
