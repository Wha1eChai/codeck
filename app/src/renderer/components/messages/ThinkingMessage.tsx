import React, { useState } from 'react'
import { ChevronRight, BrainCircuit } from 'lucide-react'
import { Message } from '@common/types'
import { useSessionStore } from '@renderer/stores/session-store'
import { cn } from '@renderer/lib/utils'

interface ThinkingMessageProps {
  message: Message
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({ message }) => {
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const isStreaming = message.isStreamDelta && sessionStatus === 'streaming'
  const [isExpanded, setIsExpanded] = useState(isStreaming)

  return (
    <div className="my-2 border rounded-md bg-muted/30 overflow-hidden self-start w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={cn(
          "h-3 w-3 transition-transform duration-200",
          isExpanded && "rotate-90"
        )} />
        <BrainCircuit className="h-3 w-3" />
        <span>Thinking Process</span>
      </button>

      {/* Smooth grid-rows collapse animation (consistent with ToolUse/ToolResult) */}
      <div className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden">
          <div className="px-3 py-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap border-t bg-muted/10">
            {message.content}
            {isStreaming && <span className="animate-pulse">_</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
