import { useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'

/**
 * Hook to synchronize backend session manager state with the frontend store.
 * Subscribes to both legacy SESSION_STATE_CHANGED and new MULTI_SESSION_STATE_CHANGED events.
 */
export function useSessionState() {
    const syncManagerState = useSessionStore(state => state.syncManagerState)
    const syncMultiSessionState = useSessionStore(state => state.syncMultiSessionState)

    useEffect(() => {
        const unsubLegacy = window.electron.onSessionStateChanged(state => {
            syncManagerState(state)
        })

        const unsubMulti = window.electron.onMultiSessionStateChanged(state => {
            syncMultiSessionState(state)
        })

        return () => {
            unsubLegacy()
            unsubMulti()
        }
    }, [syncManagerState, syncMultiSessionState])
}
