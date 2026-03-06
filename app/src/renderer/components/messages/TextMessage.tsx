import React from 'react'
import type { Message } from '@common/types'
import { formatTime } from '@renderer/lib/utils'
import { MessageRow, MessageAvatar, MessageBubble } from './primitives'
import { MessageMarkdown } from './MessageMarkdown'

interface TextMessageProps {
  message: Message
}

export const TextMessage: React.FC<TextMessageProps> = React.memo(({ message }) => {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

  return (
    <div data-message-id={message.id}>
      <MessageRow avatar={<MessageAvatar role="user" />}>
        <MessageBubble>
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`attachment ${i + 1}`}
                  className="max-h-48 max-w-64 rounded-lg border border-border/50 object-contain"
                />
              ))}
            </div>
          )}
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
})
