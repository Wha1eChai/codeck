import React, { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { AssistantThinkingStep } from '@renderer/lib/conversation-reducer'
import { FlowSection, FlowStepItem, FlowTimeline, ShowMoreText } from './primitives'

export interface ThinkingTimelineProps {
  steps: AssistantThinkingStep[]
  isStreaming: boolean
}

export const ThinkingTimeline: React.FC<ThinkingTimelineProps> = ({ steps, isStreaming }) => {
  if (steps.length === 0) return null

  const summary = useMemo(() => summarizeThinkingSteps(steps), [steps])

  return (
    <FlowSection
      title="Thinking"
      count={steps.length}
      summary={summary}
      icon={<Sparkles className={isStreaming ? 'h-3.5 w-3.5 text-amber-500 animate-pulse' : 'h-3.5 w-3.5 text-amber-500'} />}
      defaultOpen={isStreaming || steps.length <= 3}
      className="border-b border-border/40 rounded-b-none"
    >
      <FlowTimeline className="bg-muted/10">
        {steps.map((step, index) => {
          const stepTitle = truncate(extractKeyLine(step.content.trim()), 40) || `Step ${index + 1}`
          return (
          <FlowStepItem
            key={step.id}
            title={stepTitle}
            tone={step.isStreaming && isStreaming ? 'running' : 'neutral'}
            isLast={index === steps.length - 1}
          >
            <ThinkingStepContent step={step} />
          </FlowStepItem>
          )
        })}
      </FlowTimeline>
    </FlowSection>
  )
}

interface ThinkingStepContentProps {
  step: AssistantThinkingStep
}

const ThinkingStepContent: React.FC<ThinkingStepContentProps> = ({ step }) => {
  const [expanded, setExpanded] = useState(false)
  const normalized = step.content.trim()
  const keyLine = extractKeyLine(normalized)
  const hasDetails = normalized.length > keyLine.length + 8

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{keyLine}</p>

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <ShowMoreText
              text={normalized}
              maxChars={900}
              className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pt-1"
            />
          )}
        </>
      )}
    </div>
  )
}

function summarizeThinkingSteps(steps: AssistantThinkingStep[]): string {
  const latest = steps[steps.length - 1]
  if (!latest) return ''

  const keyLine = extractKeyLine(latest.content.trim())
  const truncated = truncate(keyLine, 80)
  return steps.length > 1 ? `latest: ${truncated}` : truncated
}

function extractKeyLine(content: string): string {
  if (!content) return ''
  const firstLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)
  if (!firstLine) return ''

  const sentenceMatch = firstLine.match(/^(.+?[。.!?！？])(?:\s|$)/)
  return sentenceMatch?.[1]?.trim() || firstLine
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}
