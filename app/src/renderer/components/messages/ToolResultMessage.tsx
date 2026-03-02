import React, { useState } from 'react'
import { CheckCircle2, XCircle, Terminal, ChevronRight } from 'lucide-react'
import { Message } from '@common/types'
import { cn } from '@renderer/lib/utils'

interface ToolResultMessageProps {
  message: Message
}

export const ToolResultMessage: React.FC<ToolResultMessageProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const toolName = message.toolName || 'Unknown Tool'
  const isSuccess = message.success !== false
  const resultDisplay = message.toolResult || message.content || ''

  return (
    <div className="my-1.5 border rounded-lg overflow-hidden bg-card self-start w-full shadow-sm">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 text-sm border-l-[3px] cursor-pointer transition-colors",
          "hover:bg-muted/40",
          isSuccess ? "border-l-green-500/80" : "border-l-red-500/80"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 font-medium min-w-0">
          <Terminal className={cn(
            "h-3.5 w-3.5 shrink-0",
            isSuccess ? "text-green-500/80" : "text-red-500/80"
          )} />
          <span className="truncate">{toolName} result</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSuccess
            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            : <XCircle className="h-3.5 w-3.5 text-red-500" />}
          <ChevronRight className={cn(
            "h-3.5 w-3.5 opacity-40 transition-transform duration-200",
            isExpanded && "rotate-90"
          )} />
        </div>
      </div>

      <div className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden">
          {resultDisplay && (
            <div className="border-t text-xs font-mono p-2 bg-muted/10">
              <pre className="overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                {resultDisplay}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

