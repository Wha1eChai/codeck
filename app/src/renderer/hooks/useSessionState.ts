import { useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'

/**
 * Hook to synchronize backend multi-session state with the frontend store.
 * Subscribes to MULTI_SESSION_STATE_CHANGED events only.
 */
export function useSessionState() {
    const syncMultiSessionState = useSessionStore(state => state.syncMultiSessionState)

    useEffect(() => {
        const unsub = window.electron.onMultiSessionStateChanged(state => {
            syncMultiSessionState(state)
        })
        return () => unsub()
    }, [syncMultiSessionState])
}
