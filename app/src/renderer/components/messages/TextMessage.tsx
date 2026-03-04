import React from 'react'
import type { Message } from '@common/types'
import { formatTime } from '@renderer/lib/utils'
import { MessageRow, MessageAvatar, MessageBubble } from './primitives'
import { MessageMarkdown } from './MessageMarkdown'

interface TextMessageProps {
  message: Message
}

export const TextMessage: React.FC<TextMessageProps> = ({ message }) => {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

  return (
    <div data-message-id={message.id}>
      <MessageRow avatar={<MessageAvatar role="user" />}>
        <MessageBubble>
          <div className="text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:text-xs">
            <MessageMarkdown content={content} />
          </div>
        </MessageBubble>
        <span className="text-[10px] leading-[1.4] text-muted-foreground-subtle px-1">
          {formatTime(message.timestamp)}
        </span>
      </MessageRow>
    </div>
  )
}
