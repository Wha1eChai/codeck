import React from 'react'
import type { Message } from '@common/types'
import type { ConversationGroupView } from '@renderer/lib/conversation-reducer'
import { AiMessageGroup } from '../messages/AiMessageGroup'
import { TextMessage } from '../messages/TextMessage'
import { ErrorMessage } from '../messages/ErrorMessage'
import { CompactedMessage } from '../messages/CompactedMessage'
import { FallbackMessage } from '../messages/FallbackMessage'
import { SystemBanner } from '../messages/primitives'
import { HookNotificationGroup } from '../messages/HookNotificationGroup'

interface ConversationFlowProps {
  groups: ConversationGroupView[]
}

export type SystemMessageRenderKind =
  | 'ignore'
  | 'error'
  | 'compact'
  | 'banner'
  | 'fallback'

export const ConversationFlow: React.FC<ConversationFlowProps> = ({ groups }) => {
  return (
    <>
      {groups.map((group) => (
        <div key={group.key} className="animate-message-in" data-group-id={group.key}>
          {group.kind === 'assistant' ? (
            <AiMessageGroup group={group.assistant} />
          ) : group.kind === 'user' ? (
            <TextMessage message={group.messages[0]} />
          ) : isHookGroup(group.messages) ? (
            <HookNotificationGroup messages={group.messages} />
          ) : (
            group.messages.map(renderSystemMessage)
          )}
        </div>
      ))}
    </>
  )
}

function renderSystemMessage(message: Message): React.ReactNode {
  const kind = classifySystemMessage(message)

  switch (kind) {
    case 'ignore':
      return null
    case 'error':
      return <ErrorMessage key={message.id} message={message} />
    case 'compact':
      return <CompactedMessage key={message.id} message={message} />
    case 'banner': {
      const displayContent =
        typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
      return <SystemBanner key={message.id}>{displayContent}</SystemBanner>
    }
    case 'fallback':
      return <FallbackMessage key={message.id} message={message} />
    default:
      return null
  }
}

function isHookGroup(messages: Message[]): boolean {
  return messages.length > 0 && messages.some(msg => msg.hookName !== undefined)
}

export function classifySystemMessage(message: Message): SystemMessageRenderKind {
  switch (message.type) {
    case 'usage':
    case 'permission_request':
      return 'ignore'

    case 'error':
      return 'error'

    case 'compact':
      return 'compact'

    default:
      return message.content ? 'banner' : 'fallback'
  }
}
