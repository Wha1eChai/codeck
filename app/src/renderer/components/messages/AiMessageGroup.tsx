import React, { useMemo } from 'react'
import { useSessionStore } from '@renderer/stores/session-store'
import { cn, formatTime } from '@renderer/lib/utils'
import type { AssistantMessageGroupView, AssistantHookStep, AssistantTextStep, AssistantThinkingStep, AssistantToolStep } from '@renderer/lib/conversation-reducer'
import { groupFlowStepsIntoRuns } from '@renderer/lib/conversation-reducer'
import type { FlowRun } from '@renderer/lib/conversation-reducer'
import {
  MessageRow,
  MessageAvatar,
  MessageCard,
} from './primitives'
import { MessageMarkdown } from './MessageMarkdown'
import { ThinkingTimeline } from './ThinkingTimeline'
import { ToolTimeline } from './ToolTimeline'
import { HookRunSection } from './HookRunSection'

export interface AiMessageGroupProps {
  group: AssistantMessageGroupView
}

export const AiMessageGroup: React.FC<AiMessageGroupProps> = ({ group }) => {
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const isStreamingSession = sessionStatus === 'streaming'
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
      {runs.map((run, index) => (
        <FlowRunRenderer
          key={`run-${run.kind}-${index}`}
          run={run}
          isStreamingSession={isStreamingSession}
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
  isStreamingSession: boolean
}

const FlowRunRenderer: React.FC<FlowRunRendererProps> = ({ run, isStreamingSession }) => {
  switch (run.kind) {
    case 'thinking': {
      const steps = run.steps as AssistantThinkingStep[]
      const hasStreamingThinking = steps.some(s => s.isStreaming)
      return (
        <ThinkingTimeline
          steps={steps}
          isStreaming={Boolean(hasStreamingThinking && isStreamingSession)}
        />
      )
    }

    case 'text': {
      const steps = run.steps as AssistantTextStep[]
      const nonEmpty = steps.filter(s => s.content)
      if (nonEmpty.length === 0) return null
      return (
        <MessageCard>
          <div className={cn('px-4 py-3.5 text-foreground')}>
            {nonEmpty.map(step =>
              step.messages.map(message => (
                <div key={message.id} className="markdown-body">
                  <MessageMarkdown content={message.content} />
                </div>
              )),
            )}
          </div>
        </MessageCard>
      )
    }

    case 'tool':
      return <ToolTimeline steps={run.steps as AssistantToolStep[]} />

    case 'hook':
      return <HookRunSection steps={run.steps as AssistantHookStep[]} />

    default:
      return null
  }
}
