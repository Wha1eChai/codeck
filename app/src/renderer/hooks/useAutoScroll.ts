import { useRef, useEffect, useCallback, useState } from 'react'

/**
 * Auto-scroll hook that uses ResizeObserver to detect content height changes.
 * Unlike the previous messagesLength dependency, this correctly triggers during
 * streaming updates where message content grows but the array length stays the same.
 */
export function useAutoScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // Use ResizeObserver on the scroll container to detect content height changes
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const observer = new ResizeObserver(() => {
      if (shouldAutoScroll && scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    })

    // Observe all direct children for size changes (message bubbles growing during streaming)
    const observeChildren = () => {
      for (const child of Array.from(scrollElement.children)) {
        observer.observe(child)
      }
    }

    // Use MutationObserver to track when children are added/removed
    const mutationObserver = new MutationObserver(() => {
      observer.disconnect()
      observeChildren()

      // Also scroll when new children are added
      if (shouldAutoScroll) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    })

    mutationObserver.observe(scrollElement, { childList: true })
    observeChildren()

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [shouldAutoScroll])

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
      setShouldAutoScroll(isAtBottom)
    }
  }, [])

  const scrollToBottom = useCallback(() => setShouldAutoScroll(true), [])

  return { scrollRef, handleScroll, shouldAutoScroll, scrollToBottom }
}
