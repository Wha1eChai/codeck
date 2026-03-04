import React, { useState } from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import type { AssistantFlowStep, AssistantToolStep } from '@renderer/lib/conversation-reducer'
import { cn } from '@renderer/lib/utils'
import { ToolTimeline } from './ToolTimeline'
import { MessageMarkdown } from './MessageMarkdown'

export interface AgentGroupProps {
  step: AssistantToolStep
}

export const AgentGroup: React.FC<AgentGroupProps> = ({ step }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const childSteps = step.childSteps ?? []

  const agentName = extractAgentName(step)
  const childToolCount = childSteps.filter(s => s.kind === 'tool').length
  const childTextSteps = childSteps.filter(s => s.kind === 'text')
  const childToolSteps = childSteps.filter((s): s is AssistantToolStep => s.kind === 'tool')

  const statusLabel = step.status === 'completed'
    ? 'Done'
    : step.status === 'failed'
      ? 'Failed'
      : 'Running'

  return (
    <div className="border-l-2 border-purple-400/40 pl-3 ml-1">
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/20 transition-colors text-left"
      >
        <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{agentName}</span>
        <span className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          step.status === 'completed' ? 'bg-emerald-500' :
          step.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse',
        )} />
        <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
        {childToolCount > 0 && (
          <span className="text-[10px] text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded-full">
            {childToolCount} tool{childToolCount !== 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown className={cn(
          'ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
          isExpanded && 'rotate-180',
        )} />
      </button>

      <div className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}>
        <div className="overflow-hidden">
          <div className="py-1 space-y-2">
            {childTextSteps.map(textStep => (
              <div key={textStep.id} className="px-2 text-sm">
                <MessageMarkdown content={textStep.content} />
              </div>
            ))}
            {childToolSteps.length > 0 && (
              <ToolTimeline steps={childToolSteps} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function extractAgentName(step: AssistantToolStep): string {
  const input = step.useMessage?.toolInput
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>
    if (typeof rec.description === 'string' && rec.description.length > 0) {
      return rec.description
    }
    if (typeof rec.subagent_type === 'string') {
      return rec.subagent_type
    }
    if (typeof rec.name === 'string') {
      return rec.name
    }
  }
  return 'Agent'
}
