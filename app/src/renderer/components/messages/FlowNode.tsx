import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { AssistantFlowStep, AssistantToolStep, AssistantHookStep } from '@renderer/lib/conversation-reducer'

type FlowNodeTone = 'neutral' | 'running' | 'success' | 'failed'

const DOT_STYLES: Record<FlowNodeTone, string> = {
  neutral: 'bg-muted-foreground/70',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-emerald-500',
  failed: 'bg-red-500',
}

export interface FlowNodeProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  tone?: FlowNodeTone
  summary?: string
  defaultExpanded?: boolean
  mcpBadge?: string
  children?: React.ReactNode
  className?: string
}

export const FlowNode: React.FC<FlowNodeProps> = ({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  summary,
  defaultExpanded = false,
  mcpBadge,
  children,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const hasDetails = Boolean(children)

  return (
    <div className={cn(className)}>
      <button
        type="button"
        onClick={hasDetails ? () => setIsExpanded(v => !v) : undefined}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1 text-left rounded-md',
          hasDetails && 'hover:bg-muted/15 transition-colors cursor-pointer',
          !hasDetails && 'cursor-default',
        )}
      >
        <span
          className={cn('shrink-0 w-2 h-2 rounded-full', DOT_STYLES[tone])}
          aria-hidden
        />

        <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-muted-foreground">
          {icon}
        </span>

        <span className="text-xs font-medium text-foreground truncate">{title}</span>

        {subtitle && (
          <span className="text-[11px] text-muted-foreground shrink-0">{subtitle}</span>
        )}

        {mcpBadge && (
          <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full shrink-0">
            {mcpBadge}
          </span>
        )}

        {summary && (
          <span className="ml-auto text-xs text-muted-foreground font-mono truncate max-w-[240px]">
            {summary}
          </span>
        )}

        {hasDetails && (
          <ChevronDown
            className={cn(
              'shrink-0 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
              !summary && 'ml-auto',
              isExpanded && 'rotate-180',
            )}
          />
        )}
      </button>

      {hasDetails && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 pb-3 pt-1.5 ml-7 bg-muted/5 rounded-md space-y-2 text-xs">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export interface FlowNodeStackProps {
  children: React.ReactNode
  className?: string
}

export const FlowNodeStack: React.FC<FlowNodeStackProps> = ({ children, className }) => (
  <div className={cn('flex flex-col', className)}>
    {children}
  </div>
)

export function computeDefaultExpanded(
  step: AssistantFlowStep,
  isLastStep: boolean,
  isStreaming: boolean,
): boolean {
  if (isStreaming && isLastStep) return true
  if (step.kind === 'tool') {
    const toolStep = step as AssistantToolStep
    if (toolStep.status === 'failed') return true
  }
  if (step.kind === 'hook') {
    const hookStep = step as AssistantHookStep
    if (hookStep.hookStatus === 'failed') return true
  }
  return false
}
