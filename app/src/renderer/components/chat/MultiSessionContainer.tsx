import React, { useCallback, useRef, useEffect } from 'react'
import { SessionTabBar } from './SessionTabBar'
import { ChatContainer } from './ChatContainer'
import { useSessionStore } from '../../stores/session-store'

/**
 * Wrapper around ChatContainer that adds a tab bar for multi-session navigation.
 * Only renders one ChatContainer at a time (the focused tab).
 * Stores scroll positions per session for seamless switching.
 */
export const MultiSessionContainer: React.FC = () => {
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const scrollPositions = useSessionStore(s => s.scrollPositions)
  const saveScrollPosition = useSessionStore(s => s.saveScrollPosition)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const prevSessionIdRef = useRef<string | null>(null)

  // Save scroll position when switching away from a session
  useEffect(() => {
    const prevId = prevSessionIdRef.current
    if (prevId && prevId !== currentSessionId && scrollRef.current) {
      saveScrollPosition(prevId, scrollRef.current.scrollTop)
    }
    prevSessionIdRef.current = currentSessionId
  }, [currentSessionId, saveScrollPosition])

  // Restore scroll position when switching to a session
  useEffect(() => {
    if (currentSessionId && scrollRef.current) {
      const savedPosition = scrollPositions[currentSessionId]
      if (savedPosition !== undefined) {
        // Delay to ensure DOM has rendered
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = savedPosition
          }
        })
      }
    }
  }, [currentSessionId, scrollPositions])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionTabBar />
      {/* Key forces remount on session switch — message-store is already keyed by sessionId */}
      <div className="flex-1 min-h-0">
        <ChatContainer key={currentSessionId ?? '__none__'} />
      </div>
    </div>
  )
}
