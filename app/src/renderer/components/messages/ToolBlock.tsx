import React, { useMemo, useState } from 'react'
import type { Message } from '@common/types'
import { cn } from '@renderer/lib/utils'
import { buildToolBlockViewModel } from '@renderer/lib/tool-presentation'
import { ToolChip } from './primitives'
import { DiffView } from './DiffView'

export interface ToolBlockProps {
  useMessage: Message
  resultMessage?: Message
}

export const ToolBlock: React.FC<ToolBlockProps> = ({ useMessage, resultMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const model = useMemo(
    () => buildToolBlockViewModel(useMessage, resultMessage),
    [useMessage, resultMessage],
  )

  return (
    <div>
      <ToolChip
        name={model.displayName}
        status={model.status}
        summary={model.summary}
        onClick={model.hasExpandableContent ? () => setIsExpanded(v => !v) : undefined}
        className={isExpanded ? 'rounded-b-none border-b-0' : undefined}
      />

      {model.hasExpandableContent && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="border border-t-0 border-border/50 rounded-b-[var(--chat-tool-radius)] p-2 bg-muted/10 text-xs font-mono">
              {model.contentKind === 'diff' && model.oldStr !== undefined && model.newStr !== undefined ? (
                <DiffView oldStr={model.oldStr} newStr={model.newStr} filePath={model.filePath} />
              ) : model.contentKind === 'write' && model.writeContent ? (
                <div className="rounded border overflow-hidden">
                  <div className="flex items-center px-3 py-1.5 bg-muted/50 border-b text-[11px]">
                    <span className="text-muted-foreground truncate">{model.filePath || 'new file'}</span>
                    <span className="ml-2 text-green-600 dark:text-green-400">+new</span>
                  </div>
                  <pre className="p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap text-xs">
                    {model.writeContent}
                  </pre>
                </div>
              ) : model.contentKind === 'json' ? (
                <pre className="overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(model.input, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
