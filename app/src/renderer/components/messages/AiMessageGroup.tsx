import React, { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useSessionStore } from '@renderer/stores/session-store'
import { cn, formatTime } from '@renderer/lib/utils'
import type { AssistantMessageGroupView } from '@renderer/lib/conversation-reducer'
import {
  MessageRow,
  MessageAvatar,
  MessageCard,
} from './primitives'
import { MessageMarkdown } from './MessageMarkdown'
import { ThinkingTimeline } from './ThinkingTimeline'
import { ToolTimeline } from './ToolTimeline'

export interface AiMessageGroupProps {
  group: AssistantMessageGroupView
}

export const AiMessageGroup: React.FC<AiMessageGroupProps> = ({ group }) => {
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const isStreamingSession = sessionStatus === 'streaming'
  const {
    thinkingSteps,
    text: textMessages,
    textSteps,
    toolSteps,
    other: otherMessages,
    lastMessage,
  } = group
  const nonEmptyTextMessages = useMemo(
    () => textMessages.filter(msg => msg.content),
    [textMessages],
  )
  const hasCardContent = nonEmptyTextMessages.length > 0
  const hasStreamingThinking = useMemo(
    () => thinkingSteps.some(step => step.isStreaming),
    [thinkingSteps],
  )
  const visibleOtherMessages = useMemo(
    () => otherMessages.filter(message => message.type !== 'tool_progress'),
    [otherMessages],
  )
  const sectionOrder = useMemo(() => {
    const sections: Array<{ kind: 'thinking' | 'text' | 'tool'; order: number }> = []
    if (thinkingSteps.length > 0) {
      sections.push({ kind: 'thinking', order: Math.min(...thinkingSteps.map(step => step.order)) })
    }
    if (nonEmptyTextMessages.length > 0 && textSteps.length > 0) {
      sections.push({ kind: 'text', order: Math.min(...textSteps.map(step => step.order)) })
    }
    if (toolSteps.length > 0) {
      sections.push({ kind: 'tool', order: Math.min(...toolSteps.map(step => step.order)) })
    }
    return sections.sort((a, b) => a.order - b.order)
  }, [thinkingSteps, nonEmptyTextMessages.length, textSteps, toolSteps])

  const hasVisibleContent =
    thinkingSteps.length > 0 ||
    hasCardContent ||
    toolSteps.length > 0 ||
    visibleOtherMessages.length > 0

  if (!hasVisibleContent) return null

  return (
    <MessageRow avatar={<MessageAvatar role="assistant" />}>
      {sectionOrder.map((section) => {
        if (section.kind === 'thinking') {
          return (
            <ThinkingTimeline
              key="thinking-section"
              steps={thinkingSteps}
              isStreaming={Boolean(hasStreamingThinking && isStreamingSession)}
            />
          )
        }

        if (section.kind === 'text') {
          if (!hasCardContent) return null
          return (
            <MessageCard key="text-section">
              <div className={cn('px-4 py-3.5 text-foreground')}>
                {nonEmptyTextMessages.map(message => (
                  <div key={message.id} className="markdown-body">
                    <MessageMarkdown content={message.content} />
                  </div>
                ))}
              </div>
            </MessageCard>
          )
        }

        return <ToolTimeline key="tool-section" steps={toolSteps} />
      })}

      {visibleOtherMessages.map(message => (
        <div key={message.id} className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          {message.type === 'tool_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
          <span>{message.toolName ? `${message.toolName}: ` : ''}{typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}</span>
        </div>
      ))}

      {lastMessage?.timestamp && (
        <span className="text-[10px] leading-[1.4] text-muted-foreground-subtle px-1">
          {formatTime(lastMessage.timestamp)}
        </span>
      )}
    </MessageRow>
  )
}
