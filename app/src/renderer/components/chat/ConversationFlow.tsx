import React, { useMemo } from 'react'
import type { Message } from '@common/types'
import type { ConversationGroupView } from '@renderer/lib/conversation-reducer'
import { useMessageStore } from '@renderer/stores/message-store'
import { AiMessageGroup } from '../messages/AiMessageGroup'
import { TextMessage } from '../messages/TextMessage'
import { ErrorMessage } from '../messages/ErrorMessage'
import { CompactedMessage } from '../messages/CompactedMessage'
import { FallbackMessage } from '../messages/FallbackMessage'
import { SystemBanner } from '../messages/primitives'
import { cn } from '@renderer/lib/utils'

interface ConversationFlowProps {
  groups: ConversationGroupView[]
  sessionId?: string
}

export type SystemMessageRenderKind =
  | 'ignore'
  | 'error'
  | 'compact'
  | 'banner'
  | 'fallback'

export const ConversationFlow: React.FC<ConversationFlowProps> = ({ groups, sessionId }) => {
  const rewindMessageId = useMessageStore(s =>
    sessionId ? s.rewindPoints[sessionId] : undefined,
  )

  // Find the index of the group containing the rewind point message
  const rewindGroupIndex = useMemo(() => {
    if (!rewindMessageId) return -1
    return groups.findIndex(g =>
      g.messages.some(m => m.id === rewindMessageId),
    )
  }, [rewindMessageId, groups])

  return (
    <>
      {groups.map((group, index) => {
        const isAfterRewind = rewindGroupIndex >= 0 && index > rewindGroupIndex
        const isRewindBoundary = rewindGroupIndex >= 0 && index === rewindGroupIndex

        return (
          <React.Fragment key={group.key}>
            <div
              className={cn(
                'animate-message-in',
                isAfterRewind && 'opacity-30 pointer-events-none',
              )}
              data-group-id={group.key}
            >
              {group.kind === 'assistant' ? (
                <AiMessageGroup group={group.assistant} />
              ) : group.kind === 'user' ? (
                <TextMessage message={group.messages[0]} />
              ) : (
                group.messages.map(renderSystemMessage)
              )}
            </div>

            {/* Rewind truncation line */}
            {isRewindBoundary && (
              <div className="flex items-center gap-3 my-3 px-4">
                <div className="flex-1 border-t-2 border-dashed border-red-500/50" />
                <span className="text-[10px] font-medium text-red-500/70 uppercase tracking-wider shrink-0">
                  Rewound to here
                </span>
                <div className="flex-1 border-t-2 border-dashed border-red-500/50" />
              </div>
            )}
          </React.Fragment>
        )
      })}
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
