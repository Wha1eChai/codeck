import { useEffect, useRef, useState } from 'react'

/**
 * Observes [data-group-id] elements inside the given scroll container.
 * Returns the key of the topmost currently visible conversation group.
 * Used by TimelinePanel to highlight which turn the user is reading.
 */
export function useVisibleGroupId(scrollContainer: HTMLElement | null): string | null {
    const [visibleGroupId, setVisibleGroupId] = useState<string | null>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)
    const mutationObserverRef = useRef<MutationObserver | null>(null)

    useEffect(() => {
        if (!scrollContainer) return

        const setupObserver = () => {
            observerRef.current?.disconnect()

            observerRef.current = new IntersectionObserver(
                (entries) => {
                    const topmost = entries
                        .filter(e => e.isIntersecting)
                        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
                    if (topmost) {
                        const id = (topmost.target as HTMLElement).dataset.groupId
                        if (id) setVisibleGroupId(id)
                    }
                },
                { root: scrollContainer, threshold: 0.1 }
            )

            const groups = scrollContainer.querySelectorAll<HTMLElement>('[data-group-id]')
            groups.forEach(el => observerRef.current!.observe(el))
        }

        setupObserver()

        // Re-observe when new group elements are added (during streaming)
        mutationObserverRef.current = new MutationObserver(setupObserver)
        mutationObserverRef.current.observe(scrollContainer, { childList: true, subtree: true })

        return () => {
            observerRef.current?.disconnect()
            mutationObserverRef.current?.disconnect()
        }
    }, [scrollContainer])

    return visibleGroupId
}
