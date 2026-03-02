import React from 'react'
import type { Message } from '@common/types'
import { PackageCheck } from 'lucide-react'

interface CompactedMessageProps {
  message: Message
}

export const CompactedMessage: React.FC<CompactedMessageProps> = ({ message }) => {
  return (
    <div className="flex items-start gap-3 px-4 py-3 my-2 rounded-lg border border-border/50 bg-info/50 text-info-foreground">
      <PackageCheck className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Conversation compacted</p>
        <p className="text-caption mt-0.5 opacity-80">{message.content}</p>
      </div>
    </div>
  )
}
