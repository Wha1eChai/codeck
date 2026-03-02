import React, { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { useMessageStore } from '../../stores/message-store'
import { useSessionStore } from '../../stores/session-store'
import { cn } from '../../lib/utils'

function formatTokenCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
}
const EMPTY: readonly never[] = []

export const TokenUsageBadge: React.FC = () => {
    const currentSessionId = useSessionStore(s => s.currentSessionId)
    const messagesMap = useMessageStore(s => s.messages)
    const messages = (currentSessionId && messagesMap[currentSessionId]) || EMPTY

    const totals = useMemo(() => {
        let input = 0, output = 0, cacheRead = 0, cacheWrite = 0
        for (const msg of messages) {
            if (msg.usage) {
                input += msg.usage.inputTokens
                output += msg.usage.outputTokens
                cacheRead += msg.usage.cacheReadTokens ?? 0
                cacheWrite += msg.usage.cacheWriteTokens ?? 0
            }
        }
        return { input, output, cacheRead, cacheWrite, total: input + output }
    }, [messages])

    if (totals.total === 0) {
        return (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground opacity-0 pointer-events-none" aria-hidden>
                <Zap className="h-3 w-3" />
                <span className="tabular-nums">
                    <span>↓0</span>
                    <span className="mx-0.5 opacity-40">/</span>
                    <span>↑0</span>
                </span>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span className="tabular-nums">
                <span className={cn("font-medium", totals.input > 0 && "text-blue-500 dark:text-blue-400")} title="Input tokens">
                    ↓{formatTokenCount(totals.input)}
                </span>
                <span className="mx-0.5 opacity-40">/</span>
                <span className={cn("font-medium", totals.output > 0 && "text-emerald-500 dark:text-emerald-400")} title="Output tokens">
                    ↑{formatTokenCount(totals.output)}
                </span>
            </span>
            {totals.cacheRead > 0 && (
                <span className="text-amber-500/70 tabular-nums" title="Cache read tokens">
                    ⚡{formatTokenCount(totals.cacheRead)}
                </span>
            )}
        </div>
    )
}
