import React from 'react'
import type { Message } from '@common/types'
import { formatTime } from '@renderer/lib/utils'
import { MessageRow, MessageAvatar, MessageBubble } from './primitives'

interface TextMessageProps {
  message: Message
}

export const TextMessage: React.FC<TextMessageProps> = ({ message }) => {
  return (
    <div data-message-id={message.id}>
      <MessageRow avatar={<MessageAvatar role="user" />}>
        <MessageBubble>
          <p className="whitespace-pre-wrap leading-relaxed text-sm">
            {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
          </p>
        </MessageBubble>
        <span className="text-[10px] leading-[1.4] text-muted-foreground-subtle px-1">
          {formatTime(message.timestamp)}
        </span>
      </MessageRow>
    </div>
  )
}
