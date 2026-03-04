import React, { useState } from 'react'
import { ChevronDown, Anchor } from 'lucide-react'
import type { Message } from '@common/types'
import { cn } from '@renderer/lib/utils'

export interface HookNotificationGroupProps {
  messages: Message[]
}

const STATUS_ICON: Record<string, string> = {
  completed: '\u2713',
  failed: '\u2717',
  cancelled: '\u2013',
  started: '\u2026',
  progress: '\u2026',
}

export const HookNotificationGroup: React.FC<HookNotificationGroupProps> = ({ messages }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Group by hookName and take the latest status per hook
  const hookSummaries = buildHookSummaries(messages)

  const allSucceeded = hookSummaries.every(h => h.status === 'completed')
  const hasFailure = hookSummaries.some(h => h.status === 'failed')

  const pillText = hookSummaries
    .map(h => `${h.name} ${STATUS_ICON[h.status] ?? '?'}`)
    .join('  ')

  return (
    <div className="flex justify-center my-1">
      <div className={cn(
        'inline-flex flex-col rounded-lg border transition-colors',
        hasFailure ? 'border-red-500/30 bg-red-500/5' :
        allSucceeded ? 'border-border/30 bg-muted/20' : 'border-yellow-500/30 bg-yellow-500/5',
      )}>
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Anchor className="h-3 w-3 shrink-0" />
          <span>Hooks: {pillText}</span>
          <ChevronDown className={cn(
            'h-3 w-3 transition-transform duration-200',
            isExpanded && 'rotate-180',
          )} />
        </button>

        {isExpanded && (
          <div className="border-t border-border/30 px-3 py-1.5 space-y-1">
            {hookSummaries.map(h => (
              <div key={h.name} className="flex items-center gap-2 text-[11px]">
                <span className={cn(
                  'font-medium',
                  h.status === 'failed' ? 'text-red-500' :
                  h.status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground',
                )}>
                  {STATUS_ICON[h.status] ?? '?'}
                </span>
                <span className="text-foreground/80">{h.name}</span>
                {h.output && (
                  <span className="text-muted-foreground truncate max-w-[200px]">{h.output}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface HookSummary {
  name: string
  status: string
  output?: string
}

function buildHookSummaries(messages: Message[]): HookSummary[] {
  const byName = new Map<string, HookSummary>()
  for (const msg of messages) {
    const name = msg.hookName ?? 'unknown'
    const status = msg.hookStatus ?? 'started'
    const existing = byName.get(name)
    // Later status overwrites earlier (started → progress → completed/failed)
    if (!existing || statusPriority(status) >= statusPriority(existing.status)) {
      byName.set(name, {
        name,
        status,
        output: extractHookOutput(msg.content),
      })
    }
  }
  return [...byName.values()]
}

function statusPriority(status: string): number {
  switch (status) {
    case 'started': return 0
    case 'progress': return 1
    case 'completed': return 2
    case 'failed': return 3
    case 'cancelled': return 3
    default: return 0
  }
}

function extractHookOutput(content: string | unknown): string | undefined {
  if (typeof content !== 'string') return undefined
  // Strip "[Hook: name] " prefix if present
  const match = content.match(/^\[Hook: [^\]]+\]\s*(.+)$/)
  return match?.[1] ?? undefined
}
