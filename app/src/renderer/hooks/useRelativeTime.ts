import { useState, useEffect, useRef } from 'react'

/**
 * Hook that triggers a re-render periodically so that relative timestamps
 * stay fresh. Uses a tiered strategy:
 *   - If any visible timestamp is < 1 hour old → tick every 60s
 *   - Otherwise → no ticking (static text is fine)
 *
 * Returns a `now` value that components should use as the basis for
 * formatRelativeTime(). This avoids per-item timers.
 */
export function useRelativeTime(hasRecentItems: boolean) {
    const [now, setNow] = useState(Date.now)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        // Clear any existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }

        if (hasRecentItems) {
            intervalRef.current = setInterval(() => {
                setNow(Date.now())
            }, 60_000) // Tick every 60s
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [hasRecentItems])

    return now
}
