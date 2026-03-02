import React, { useState } from 'react'
import { Terminal, ChevronRight, ChevronDown } from 'lucide-react'
import { Message } from '@common/types'
import { DiffView } from './DiffView'
import { cn } from '@renderer/lib/utils'

interface ToolUseMessageProps {
  message: Message
}

/** Tools whose toolInput contains old_str/new_str for diff rendering */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit'])

/** Tools that create new files (show raw content instead of diff) */
const WRITE_TOOLS = new Set(['Write'])

export const ToolUseMessage: React.FC<ToolUseMessageProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const toolName = message.toolName || 'Unknown Tool'
  const input = message.toolInput

  const isEditTool = EDIT_TOOLS.has(toolName)
  const isWriteTool = WRITE_TOOLS.has(toolName)
  const filePath = input?.file_path as string | undefined

  // Edit tool: extract old_str / new_str for diff
  const oldStr = isEditTool ? (input?.old_str as string | undefined) : undefined
  const newStr = isEditTool ? (input?.new_str as string | undefined) : undefined
  const hasDiff = oldStr !== undefined && newStr !== undefined

  // Write tool: extract content for syntax-highlighted display
  const writeContent = isWriteTool ? (input?.content as string | undefined) : undefined

  const inputDisplay = JSON.stringify(input, null, 2)

  return (
    <div className="my-1.5 border rounded-lg overflow-hidden bg-card self-start w-full shadow-sm">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 text-sm border-l-[3px] cursor-pointer transition-colors",
          "hover:bg-muted/40",
          "border-l-blue-500/80"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 font-medium min-w-0">
          <Terminal className="h-3.5 w-3.5 text-blue-500/80 shrink-0" />
          <span className="truncate">
            {isEditTool ? 'Editing' : isWriteTool ? 'Writing' : 'Using'}{' '}
            {filePath ? <span className="font-mono text-xs opacity-80">{filePath}</span> : toolName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground font-mono">{toolName}</span>
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
          <div className="border-t p-2 bg-muted/10">
            {hasDiff ? (
              <DiffView oldStr={oldStr} newStr={newStr} filePath={filePath} />
            ) : writeContent ? (
              <div className="rounded border overflow-hidden text-xs font-mono">
                <div className="flex items-center px-3 py-1.5 bg-muted/50 border-b text-[11px]">
                  <span className="text-muted-foreground truncate">
                    {filePath || 'new file'}
                  </span>
                  <span className="ml-2 text-green-600 dark:text-green-400">+new</span>
                </div>
                <pre className="p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap text-xs">
                  {writeContent}
                </pre>
              </div>
            ) : (
              <>
                <div className="mb-1 text-muted-foreground font-semibold text-xs">Input:</div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono">{inputDisplay}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

