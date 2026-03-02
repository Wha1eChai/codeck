import React from 'react'
import { Message, MessageType } from '@common/types'
import { TextMessage } from './TextMessage'
import { ThinkingMessage } from './ThinkingMessage'
import { ToolUseMessage } from './ToolUseMessage'
import { ToolResultMessage } from './ToolResultMessage'
import { ToolProgressMessage } from './ToolProgressMessage'
import { ErrorMessage } from './ErrorMessage'
import { UsageMessage } from './UsageMessage'
import { CompactedMessage } from './CompactedMessage'
import { FallbackMessage } from './FallbackMessage'

interface MessageComponentProps {
  message: Message
}

/**
 * Flat message renderer — used as fallback for individual messages.
 *
 * NOTE: In the new grouped layout, ChatContainer handles grouping and uses
 * AiMessageGroup for contiguous assistant messages. This registry is kept
 * for any edge-case standalone rendering needs.
 */
const COMPONENT_REGISTRY: Record<MessageType, React.ComponentType<MessageComponentProps>> = {
  text: TextMessage,
  thinking: ThinkingMessage,
  tool_use: ToolUseMessage,
  tool_result: ToolResultMessage,
  tool_progress: ToolProgressMessage,
  error: ErrorMessage,
  usage: UsageMessage as React.ComponentType<MessageComponentProps>,
  compact: CompactedMessage,
  permission_request: FallbackMessage,
}

interface MessageRendererProps {
  message: Message
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  const Component = COMPONENT_REGISTRY[message.type] ?? FallbackMessage
  return (
    <div className="animate-message-in">
      <Component message={message} />
    </div>
  )
}
