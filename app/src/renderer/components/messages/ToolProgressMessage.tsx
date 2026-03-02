import React from 'react'
import { Loader2 } from 'lucide-react'
import { Message } from '@common/types'

interface ToolProgressMessageProps {
  message: Message
}

export const ToolProgressMessage: React.FC<ToolProgressMessageProps> = ({ message }) => {
  const toolName = message.toolName || 'Tool'

  return (
    <div className="my-1 flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground self-start">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{toolName}: {message.content}</span>
    </div>
  )
}
