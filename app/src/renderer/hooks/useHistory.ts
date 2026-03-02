import { useState, useCallback, useEffect } from 'react'
import type { HistoryEntry } from '@common/types'

/**
 * Hook for browsing global session history across all projects.
 * Delegates to sessions-server via IPC.
 */
export function useHistory() {
    const [entries, setEntries] = useState<readonly HistoryEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing'>('idle')

    const loadHistory = useCallback(async () => {
        setIsLoading(true)
        try {
            const sessions = await window.electron.getAllSessions()
            setEntries(sessions)
        } catch (err) {
            console.error('Failed to load history:', err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const searchHistory = useCallback(async (query: string) => {
        if (!query.trim()) {
            return loadHistory()
        }
        setIsLoading(true)
        try {
            const results = await window.electron.searchSessions(query)
            setEntries(results)
        } catch (err) {
            console.error('Failed to search history:', err)
        } finally {
            setIsLoading(false)
        }
    }, [loadHistory])

    /** Trigger sync then reload history entries. */
    const syncAndLoad = useCallback(async () => {
        setSyncStatus('syncing')
        try {
            await window.electron.triggerSync()
        } catch (err) {
            console.error('Sync failed:', err)
        } finally {
            setSyncStatus('idle')
        }
        await loadHistory()
    }, [loadHistory])

    // Listen for push-based sync completion (e.g. after session ends)
    useEffect(() => {
        const unsub = window.electron.onSyncCompleted(() => {
            loadHistory()
        })
        return unsub
    }, [loadHistory])

    return {
        entries,
        isLoading,
        syncStatus,
        loadHistory,
        searchHistory,
        syncAndLoad,
    }
}
