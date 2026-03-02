import { useEffect, useCallback } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useSessionStore } from '../stores/session-store'
import { useSessionActions } from './useSessionActions'

/**
 * Global keyboard shortcuts for the application.
 *
 * Shortcuts:
 * - Ctrl+B     → Toggle sidebar
 * - Ctrl+N     → Quick-create new session
 * - Ctrl+,     → Toggle settings page
 * - Ctrl+L     → Focus chat input
 * - Ctrl+Shift+T → Toggle timeline panel
 */
export function useKeyboardShortcuts() {
    const toggleSidebar = useUIStore(s => s.toggleSidebar)
    const toggleTimeline = useUIStore(s => s.toggleTimeline)
    const toggleSettings = useUIStore(s => s.toggleSettings)
    const currentSessionId = useSessionStore(s => s.currentSessionId)
    const { quickCreateSession } = useSessionActions()

    const handleNewSession = useCallback(() => {
        quickCreateSession()
    }, [quickCreateSession])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const ctrl = e.ctrlKey || e.metaKey

            if (!ctrl) return

            switch (e.key) {
                case 'b':
                    e.preventDefault()
                    toggleSidebar()
                    break
                case 'n':
                    e.preventDefault()
                    handleNewSession()
                    break
                case ',':
                    e.preventDefault()
                    toggleSettings()
                    break
                case 'l':
                    e.preventDefault()
                    // Focus the chat input textarea
                    document.querySelector<HTMLTextAreaElement>('[data-chat-input]')?.focus()
                    break
                case 'T':
                    // Ctrl+Shift+T
                    if (e.shiftKey) {
                        e.preventDefault()
                        if (currentSessionId) toggleTimeline(currentSessionId)
                    }
                    break
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [toggleSidebar, toggleTimeline, toggleSettings, handleNewSession, currentSessionId])
}
