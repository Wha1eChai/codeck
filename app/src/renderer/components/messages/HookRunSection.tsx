import React from 'react'
import { Anchor } from 'lucide-react'
import type { AssistantHookStep } from '@renderer/lib/conversation-reducer'
import { cn } from '@renderer/lib/utils'
import { FlowSection, FlowStepItem, FlowTimeline } from './primitives'

const STATUS_ICON: Record<string, string> = {
  completed: '\u2713',
  failed: '\u2717',
  cancelled: '\u2013',
  started: '\u2026',
  progress: '\u2026',
}

export interface HookRunSectionProps {
  steps: AssistantHookStep[]
}

export const HookRunSection: React.FC<HookRunSectionProps> = ({ steps }) => {
  if (steps.length === 0) return null

  const hasFailure = steps.some(s => s.hookStatus === 'failed')
  const summary = steps.map(s => `${s.hookName} ${STATUS_ICON[s.hookStatus] ?? '?'}`).join(', ')

  return (
    <FlowSection
      title="Hooks"
      count={steps.length}
      summary={summary}
      icon={<Anchor className="h-3.5 w-3.5 text-muted-foreground" />}
      defaultOpen={hasFailure}
    >
      <FlowTimeline>
        {steps.map((step, index) => (
          <FlowStepItem
            key={step.id}
            title={step.hookName}
            subtitle={step.hookStatus}
            tone={mapHookTone(step.hookStatus)}
            isLast={index === steps.length - 1}
          >
            {step.hookOutput && (
              <div className={cn(
                'text-xs px-2 py-1 rounded border border-border/40',
                step.hookStatus === 'failed'
                  ? 'text-red-500/90 bg-red-500/5'
                  : 'text-muted-foreground bg-muted/10',
              )}>
                {step.hookOutput}
              </div>
            )}
          </FlowStepItem>
        ))}
      </FlowTimeline>
    </FlowSection>
  )
}

function mapHookTone(status: string): 'neutral' | 'running' | 'success' | 'failed' {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'failed'
    case 'started':
    case 'progress': return 'running'
    default: return 'neutral'
  }
}
