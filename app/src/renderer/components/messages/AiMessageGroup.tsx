import React, { useMemo } from 'react'
import { Sparkles, Wrench, Anchor, Bot } from 'lucide-react'
import { useSessionStore } from '@renderer/stores/session-store'
import { cn, formatTime } from '@renderer/lib/utils'
import type {
  AssistantMessageGroupView,
  AssistantHookStep,
  AssistantTextStep,
  AssistantThinkingStep,
  AssistantToolStep,
  AssistantFlowStep,
} from '@renderer/lib/conversation-reducer'
import { groupFlowStepsIntoRuns } from '@renderer/lib/conversation-reducer'
import type { FlowRun } from '@renderer/lib/conversation-reducer'
import { buildToolBlockViewModel } from '@renderer/lib/tool-presentation'
import {
  MessageRow,
  MessageAvatar,
} from './primitives'
import { MessageMarkdown } from './MessageMarkdown'
import { FlowNode, FlowNodeStack, computeDefaultExpanded } from './FlowNode'
import {
  ThinkingNodeDetail,
  ToolNodeDetail,
  HookNodeDetail,
  AgentNodeDetail,
  extractKeyLine,
  truncate,
  extractAgentName,
  readResultText,
} from './FlowNodeDetails'

export interface AiMessageGroupProps {
  group: AssistantMessageGroupView
}

export const AiMessageGroup: React.FC<AiMessageGroupProps> = ({ group }) => {
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const isStreaming = sessionStatus === 'streaming'
  const { flowSteps, lastMessage } = group

  const runs = useMemo(() => groupFlowStepsIntoRuns(flowSteps), [flowSteps])

  const hasVisibleContent = useMemo(() => {
    return runs.some(run => {
      if (run.kind === 'text') {
        return run.steps.some(s => (s as AssistantTextStep).content)
      }
      return true
    })
  }, [runs])

  if (!hasVisibleContent) return null

  return (
    <MessageRow avatar={<MessageAvatar role="assistant" />}>
      {runs.map((run, runIndex) => (
        <FlowRunRenderer
          key={`run-${run.kind}-${runIndex}`}
          run={run}
          isStreaming={isStreaming}
          isLastRun={runIndex === runs.length - 1}
        />
      ))}

      {lastMessage?.timestamp && (
        <span className="text-[10px] leading-[1.4] text-muted-foreground-subtle px-1">
          {formatTime(lastMessage.timestamp)}
        </span>
      )}
    </MessageRow>
  )
}

interface FlowRunRendererProps {
  run: FlowRun
  isStreaming: boolean
  isLastRun: boolean
}

const FlowRunRenderer: React.FC<FlowRunRendererProps> = ({ run, isStreaming, isLastRun }) => {
  // Text runs render naked — no card, no border
  if (run.kind === 'text') {
    const steps = run.steps as AssistantTextStep[]
    const nonEmpty = steps.filter(s => s.content)
    if (nonEmpty.length === 0) return null
    return (
      <div className="text-foreground pl-3">
        {nonEmpty.map(step =>
          step.messages.map(message => (
            <div key={message.id} className="markdown-body">
              <MessageMarkdown content={message.content} />
            </div>
          )),
        )}
      </div>
    )
  }

  // Non-text runs: render as flat FlowNode stream
  const { steps } = run

  const nodes = steps.map((step, i) => (
    <RenderFlowNode
      key={step.id}
      step={step}
      isLastStep={isLastRun && i === steps.length - 1}
      isStreaming={isStreaming}
    />
  ))

  return steps.length > 1 ? <FlowNodeStack>{nodes}</FlowNodeStack> : <>{nodes}</>
}

interface RenderFlowNodeProps {
  step: AssistantFlowStep
  isLastStep: boolean
  isStreaming: boolean
}

const RenderFlowNode: React.FC<RenderFlowNodeProps> = ({
  step,
  isLastStep,
  isStreaming,
}) => {
  const expanded = computeDefaultExpanded(step, isLastStep, isStreaming)

  switch (step.kind) {
    case 'thinking': {
      const thinkingStep = step as AssistantThinkingStep
      const keyLine = extractKeyLine(thinkingStep.content.trim())
      return (
        <FlowNode
          icon={<Sparkles className={cn('h-3.5 w-3.5 text-amber-500', thinkingStep.isStreaming && isStreaming && 'animate-pulse')} />}
          title="Thinking"
          summary={truncate(keyLine, 60) || undefined}
          tone={thinkingStep.isStreaming && isStreaming ? 'running' : 'neutral'}
          defaultExpanded={expanded}

        >
          <ThinkingNodeDetail step={thinkingStep} />
        </FlowNode>
      )
    }

    case 'tool': {
      const toolStep = step as AssistantToolStep

      // Sub-agent tool steps
      if (toolStep.childSteps && toolStep.childSteps.length > 0) {
        const agentName = extractAgentName(toolStep)
        const statusLabel = toolStep.status === 'completed' ? 'Done' : toolStep.status === 'failed' ? 'Failed' : 'Running'
        return (
          <FlowNode
            icon={<Bot className="h-3.5 w-3.5 text-purple-500" />}
            title={agentName}
            subtitle={statusLabel}
            tone={toolStep.status === 'failed' ? 'failed' : toolStep.status === 'completed' ? 'success' : 'running'}
            defaultExpanded={expanded}
  
          >
            <AgentNodeDetail step={toolStep} />
          </FlowNode>
        )
      }

      const baseMessage = toolStep.useMessage ?? toolStep.resultMessage
      const model = baseMessage ? buildToolBlockViewModel(baseMessage, toolStep.resultMessage) : null
      const hasContent = Boolean(
        model?.hasExpandableContent ||
        readResultText(toolStep) ||
        toolStep.progressMessages.length > 1,
      )
      const summary = toolStep.latestProgressMessage?.content ?? model?.summary
      const tone = toolStep.status === 'failed' ? 'failed' as const : toolStep.status === 'completed' ? 'success' as const : 'running' as const

      return (
        <FlowNode
          icon={<Wrench className="h-3.5 w-3.5" />}
          title={model?.displayName ?? toolStep.toolName}
          tone={tone}
          summary={summary}
          defaultExpanded={expanded || toolStep.status === 'failed'}
          mcpBadge={model?.source === 'mcp' ? model.mcpServerName : undefined}

        >
          {hasContent ? <ToolNodeDetail step={toolStep} /> : undefined}
        </FlowNode>
      )
    }

    case 'hook': {
      const hookStep = step as AssistantHookStep
      const hookTone = hookStep.hookStatus === 'failed' ? 'failed' as const
        : hookStep.hookStatus === 'completed' ? 'success' as const
        : (hookStep.hookStatus === 'started' || hookStep.hookStatus === 'progress') ? 'running' as const
        : 'neutral' as const

      return (
        <FlowNode
          icon={<Anchor className="h-3.5 w-3.5" />}
          title={hookStep.hookName}
          subtitle={hookStep.hookStatus}
          tone={hookTone}
          defaultExpanded={expanded}

        >
          {hookStep.hookOutput ? <HookNodeDetail step={hookStep} /> : undefined}
        </FlowNode>
      )
    }

    default:
      return null
  }
}
