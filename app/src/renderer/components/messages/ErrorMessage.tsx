import React, { useState } from 'react'
import { AlertTriangle, Copy, Check } from 'lucide-react'
import { Message } from '@common/types'
import { cn } from '@renderer/lib/utils'
import { useToastStore } from '../../stores/toast-store'

interface ErrorMessageProps {
  message: Message
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false)
  const addToast = useToastStore(s => s.addToast)
  const content = message.content || 'Unknown error'
  const isLong = content.length > 120

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast('Could not copy to clipboard', 'error')
    }
  }

  // Short errors: compact inline badge
  if (!isLong) {
    return (
      <div className="my-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm self-start w-full border border-destructive/20">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="leading-snug">{content}</span>
      </div>
    )
  }

  // Long/structured errors: card with copy
  return (
    <div className="my-2 self-start w-full rounded-lg border border-destructive/30 bg-destructive/5 dark:bg-destructive/10 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-l-[3px] border-l-destructive">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-sm font-medium text-destructive flex-1">Error</span>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Copy error"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <div className="px-3 pb-2.5 pt-1">
        <pre className="whitespace-pre-wrap break-words text-xs font-mono text-foreground/80 max-h-40 overflow-y-auto">
          {content}
        </pre>
      </div>
    </div>
  )
}


