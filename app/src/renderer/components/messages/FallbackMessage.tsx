import React from 'react'
import { Message } from '@common/types'

interface FallbackMessageProps {
  message: Message
}

export const FallbackMessage: React.FC<FallbackMessageProps> = ({ message }) => {
  if (!message.content) return null

  return (
    <div className="my-1 px-3 py-1 text-xs text-muted-foreground/60 self-center italic">
      [{message.type}] {message.content}
    </div>
  )
}
