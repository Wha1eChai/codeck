import React, { useMemo, useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { AlertCircle, ScrollText } from 'lucide-react'
import type { Message } from '@common/types'
import type { ConversationGroupView, UserGroupSubtype } from '@renderer/lib/conversation-reducer'
import { useMessageStore } from '@renderer/stores/message-store'
import { AiMessageGroup } from '../messages/AiMessageGroup'
import { TextMessage } from '../messages/TextMessage'
import { ErrorMessage } from '../messages/ErrorMessage'
import { CompactedMessage } from '../messages/CompactedMessage'
import { FallbackMessage } from '../messages/FallbackMessage'
import { SystemBanner } from '../messages/primitives'
import { FlowNode } from '../messages/FlowNode'
import { MessageMarkdown } from '../messages/MessageMarkdown'
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

// CSS content-visibility: auto on older groups lets the browser skip layout/paint
// for off-screen messages. The last TAIL_RENDER_COUNT groups always render fully
// to avoid visual glitches during streaming.
const TAIL_RENDER_COUNT = 20
const OFFSCREEN_STYLE: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 200px',
}

// Message window slicing: only render recent groups, load more on scroll-up
const INITIAL_WINDOW = 30
const LOAD_CHUNK = 20

export const ConversationFlow: React.FC<ConversationFlowProps> = ({ groups, sessionId }) => {
  const rewindMessageId = useMessageStore(s =>
    sessionId ? s.rewindPoints[sessionId] : undefined,
  )

  // ── Message window slicing ──
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(0, groups.length - INITIAL_WINDOW),
  )
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevSessionId = useRef(sessionId)

  // Reset window when session changes or groups grow (streaming)
  useEffect(() => {
    if (sessionId !== prevSessionId.current) {
      // Session switch: show latest messages
      prevSessionId.current = sessionId
      setWindowStart(Math.max(0, groups.length - INITIAL_WINDOW))
      return
    }
    // Auto-advance: keep window pinned to tail during streaming
    const idealStart = Math.max(0, groups.length - INITIAL_WINDOW)
    setWindowStart(prev => Math.max(prev, idealStart))
  }, [groups.length, sessionId])

  // Load more groups when sentinel enters viewport (scroll-up)
  const loadMore = useCallback(() => {
    setWindowStart(prev => Math.max(0, prev - LOAD_CHUNK))
  }, [])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || windowStart <= 0) return

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px 0px 0px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [windowStart, loadMore])

  const visibleGroups = useMemo(
    () => groups.slice(windowStart),
    [groups, windowStart],
  )

  // Find the index of the group containing the rewind point message
  const rewindGroupIndex = useMemo(() => {
    if (!rewindMessageId) return -1
    return groups.findIndex(g =>
      g.messages.some(m => m.id === rewindMessageId),
    )
  }, [rewindMessageId, groups])

  // Adjust rewind index relative to visible window
  const visibleRewindIndex = rewindGroupIndex >= 0 ? rewindGroupIndex - windowStart : -1

  return (
    <>
      {/* Sentinel for loading earlier messages */}
      {windowStart > 0 && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <span className="text-xs text-muted-foreground-subtle">
            {windowStart} earlier messages
          </span>
        </div>
      )}

      {visibleGroups.map((group, index) => {
        const isAfterRewind = visibleRewindIndex >= 0 && index > visibleRewindIndex
        const isRewindBoundary = visibleRewindIndex >= 0 && index === visibleRewindIndex

        const useContentVisibility = index < visibleGroups.length - TAIL_RENDER_COUNT

        return (
          <React.Fragment key={group.key}>
            <div
              className={cn(
                'animate-message-in',
                isAfterRewind && 'opacity-30 pointer-events-none',
              )}
              data-group-id={group.key}
              style={useContentVisibility ? OFFSCREEN_STYLE : undefined}
            >
              {group.kind === 'assistant' ? (
                <AiMessageGroup group={group.assistant} />
              ) : group.kind === 'user' ? (
                renderUserGroup(group.messages[0], group.userSubtype)
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

function renderUserGroup(msg: Message, subtype: UserGroupSubtype): React.ReactNode {
  const content = typeof msg.content === 'string' ? msg.content : ''

  switch (subtype) {
    case 'hidden':
      return null

    case 'interrupted':
      return (
        <SystemBanner icon={<AlertCircle className="h-3 w-3 opacity-60" />}>
          {content}
        </SystemBanner>
      )

    case 'system-injection': {
      const title = extractInjectionTitle(content)
      return (
        <FlowNode
          icon={<ScrollText className="h-3.5 w-3.5" />}
          title={title}
          tone="neutral"
          defaultExpanded={false}
        >
          <div className="text-xs text-muted-foreground max-h-60 overflow-y-auto [&_p]:mb-1.5 [&_p:last-child]:mb-0">
            <MessageMarkdown content={content} />
          </div>
        </FlowNode>
      )
    }

    case 'real':
    default:
      return <TextMessage message={msg} />
  }
}

function extractInjectionTitle(content: string): string {
  const cmdMatch = content.match(/<command-name>([^<]+)<\/command-name>/)
  if (cmdMatch) return `Skill: ${cmdMatch[1].replace(/^\//, '')}`

  const msgMatch = content.match(/<command-message>([^<]+)<\/command-message>/)
  if (msgMatch) return `Command: ${msgMatch[1]}`

  if (content.startsWith('Base directory for this skill:')) return 'Skill Context'

  return 'System Context'
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
