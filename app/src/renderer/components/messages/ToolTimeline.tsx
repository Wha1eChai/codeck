import React, { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Wrench } from 'lucide-react'
import type { AssistantToolStep } from '@renderer/lib/conversation-reducer'
import { cn } from '@renderer/lib/utils'
import { buildToolBlockViewModel } from '@renderer/lib/tool-presentation'
import { semanticToolSummary, statisticalSuffix } from '@renderer/lib/tool-summary'
import { DiffView } from './DiffView'
import { FlowSection, FlowStepItem, FlowTimeline, ShowMoreText } from './primitives'
import { AgentGroup } from './AgentGroup'

const INITIAL_VISIBLE = 3

export interface ToolTimelineProps {
  steps: AssistantToolStep[]
}

export const ToolTimeline: React.FC<ToolTimelineProps> = ({ steps }) => {
  const [showAll, setShowAll] = useState(false)

  if (steps.length === 0) return null

  const title = semanticToolSummary(steps)
  const summary = statisticalSuffix(steps)
  const visibleSteps = showAll || steps.length <= INITIAL_VISIBLE
    ? steps
    : steps.slice(0, INITIAL_VISIBLE)
  const hiddenCount = steps.length - INITIAL_VISIBLE

  return (
    <FlowSection
      title={title || 'Tools'}
      count={steps.length}
      summary={summary}
      icon={<Wrench className="h-3.5 w-3.5 text-muted-foreground" />}
      defaultOpen={steps.length <= 4}
    >
      <FlowTimeline>
        {visibleSteps.map((step, index) => (
          <ToolStepRow
            key={step.id}
            step={step}
            isLast={!showAll && index === visibleSteps.length - 1 && hiddenCount <= 0}
          />
        ))}
      </FlowTimeline>
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-xs text-primary/70 hover:text-primary transition-colors text-center border-t border-border/30"
        >
          Show {hiddenCount} more...
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="w-full py-2 text-xs text-primary/70 hover:text-primary transition-colors text-center border-t border-border/30"
        >
          Show less
        </button>
      )}
    </FlowSection>
  )
}

interface ToolStepRowProps {
  step: AssistantToolStep
  isLast: boolean
}

const ToolStepRow: React.FC<ToolStepRowProps> = ({ step, isLast }) => {
  // Sub-agent tool steps with child steps get dedicated rendering
  if (step.childSteps && step.childSteps.length > 0) {
    return (
      <FlowStepItem
        title={step.toolName}
        subtitle="Agent"
        tone={mapToolTone(step.status)}
        isLast={isLast}
      >
        <AgentGroup step={step} />
      </FlowStepItem>
    )
  }

  const baseMessage = step.useMessage ?? step.resultMessage
  const model = useMemo(
    () => (baseMessage ? buildToolBlockViewModel(baseMessage, step.resultMessage) : null),
    [baseMessage, step.resultMessage],
  )
  const resultText = readResultText(step)
  const hasDetails = Boolean(
    model?.hasExpandableContent ||
    resultText ||
    step.progressMessages.length > 1,
  )
  const [isExpanded, setIsExpanded] = useState(step.status === 'failed')

  const summary = step.latestProgressMessage?.content
    ?? model?.summary
    ?? summarizeStatus(step.status)

  const statusLabel = step.status === 'completed'
    ? 'Done'
    : step.status === 'failed'
      ? 'Failed'
      : 'Running'

  return (
    <FlowStepItem
      title={step.toolName}
      subtitle={statusLabel}
      tone={mapToolTone(step.status)}
      isLast={isLast}
    >
      <div className="rounded-md border border-border/50 bg-muted/10">
        <button
          type="button"
          onClick={hasDetails ? () => setIsExpanded(v => !v) : undefined}
          className={cn(
            'w-full px-3 py-2 flex items-center gap-2 text-left',
            hasDetails && 'hover:bg-muted/20 transition-colors',
          )}
        >
          {step.status === 'running'
            ? <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
            : <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDotColor(step.status))} />}

          <span className="text-xs text-muted-foreground truncate">{summary}</span>

          {hasDetails && (
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
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
              <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2 text-xs">
                {step.progressMessages.length > 1 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Progress</div>
                    {step.progressMessages.map((progress) => (
                      <div key={progress.id} className="text-muted-foreground">
                        {progress.content}
                      </div>
                    ))}
                  </div>
                )}

                {model && (
                  <ToolInputDetail model={model} />
                )}

                {resultText && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground">Result</div>
                    <ShowMoreText
                      text={resultText}
                      maxChars={560}
                      className="whitespace-pre-wrap break-words text-foreground/90"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </FlowStepItem>
  )
}

interface ToolInputDetailProps {
  model: ReturnType<typeof buildToolBlockViewModel>
}

const ToolInputDetail: React.FC<ToolInputDetailProps> = ({ model }) => {
  if (model.contentKind === 'diff' && model.oldStr !== undefined && model.newStr !== undefined) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">Changes</div>
        <DiffView oldStr={model.oldStr} newStr={model.newStr} filePath={model.filePath} />
      </div>
    )
  }

  if (model.contentKind === 'write' && model.writeContent) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">Write Content</div>
        <pre className="rounded border border-border/50 bg-card/70 p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap text-xs">
          {model.writeContent}
        </pre>
      </div>
    )
  }

  if (model.contentKind === 'json' && model.input) {
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">Input</div>
        <pre className="rounded border border-border/50 bg-card/70 p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(model.input, null, 2)}
        </pre>
      </div>
    )
  }

  return null
}

function mapToolTone(status: AssistantToolStep['status']): 'running' | 'success' | 'failed' {
  if (status === 'failed') return 'failed'
  if (status === 'completed') return 'success'
  return 'running'
}

function summarizeStatus(status: AssistantToolStep['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Running...'
}

function statusDotColor(status: AssistantToolStep['status']): string {
  if (status === 'failed') return 'bg-red-500'
  if (status === 'completed') return 'bg-emerald-500'
  return 'bg-blue-500'
}

function readResultText(step: AssistantToolStep): string | null {
  const raw = step.resultMessage?.toolResult ?? step.resultMessage?.content
  if (typeof raw === 'string' && raw.trim().length > 0) return raw
  if (raw === null || raw === undefined) return null
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}
