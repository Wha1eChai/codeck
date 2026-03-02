import { useCallback, useState } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useSettingsStore } from '../stores/settings-store'
import { useMessageStore } from '../stores/message-store'
import { useUIStore } from '../stores/ui-store'
import type { CreateSessionInput } from '@common/types'

/**
 * Centralized hook for all session management operations.
 * Replaces direct window.electron.* calls scattered across components.
 */
export function useSessionActions() {
    const setCurrentSession = useSessionStore(s => s.setCurrentSession)
    const setSessions = useSessionStore(s => s.setSessions)
    const removeSession = useSessionStore(s => s.removeSession)
    const updateSession = useSessionStore(s => s.updateSession)
    const sessions = useSessionStore(s => s.sessions)
    const currentSessionId = useSessionStore(s => s.currentSessionId)
    const projectPath = useSessionStore(s => s.projectPath)
    const setMessages = useMessageStore(s => s.setMessages)
    const addTab = useSessionStore(s => s.addTab)
    const removeTab = useSessionStore(s => s.removeTab)
    const setFocusedTab = useSessionStore(s => s.setFocusedTab)

    const [loading, setLoading] = useState(false)

    /**
     * Switch to a different session.
     * Calls the backend switchSession IPC which handles abort + resume atomically.
     */
    const switchSession = useCallback(async (sessionId: string) => {
        if (sessionId === currentSessionId) return
        setLoading(true)
        try {
            const result = await window.electron.switchSession(sessionId)
            setMessages(sessionId, [...result.messages])
            if (result.session) {
                updateSession(sessionId, result.session)
            }
            setCurrentSession(sessionId)
            setFocusedTab(sessionId)
        } catch (error) {
            console.error('Failed to switch session:', error)
            throw error
        } finally {
            setLoading(false)
        }
    }, [currentSessionId, setCurrentSession, setMessages, updateSession, setFocusedTab])

    /**
     * Create a new session and switch to it.
     */
    const createSession = useCallback(async (input: CreateSessionInput) => {
        setLoading(true)
        try {
            const session = await window.electron.createSession(input)
            await window.electron.resumeSession(session.id)
            setSessions([...useSessionStore.getState().sessions, session])
            setCurrentSession(session.id)
            // Open a tab for the new session
            addTab({ sessionId: session.id, name: session.name, status: 'idle' })
            return session
        } catch (error) {
            console.error('Failed to create session:', error)
            throw error
        } finally {
            setLoading(false)
        }
    }, [setSessions, setCurrentSession, addTab])

    /**
     * Delete a session. Calls backend first, then cleans up store.
     */
    const deleteSession = useCallback(async (sessionId: string) => {
        try {
            await window.electron.deleteSession(sessionId)
        } catch {
            // Deletion may fail if the file is already gone — proceed with store cleanup
        }
        removeSession(sessionId)
    }, [removeSession])

    /**
     * Open a session tab (for history entries or existing sessions).
     */
    const openSessionTab = useCallback(async (sessionId: string, name: string) => {
        addTab({ sessionId, name, status: 'idle' })
        await switchSession(sessionId)
    }, [addTab, switchSession])

    /**
     * Close a session tab.
     */
    const closeSessionTab = useCallback(async (sessionId: string) => {
        removeTab(sessionId)
        try {
            await window.electron.closeSessionTab(sessionId)
        } catch {
            // Non-critical
        }
    }, [removeTab])

    /**
     * Focus a session tab without reloading history.
     */
    const focusSessionTab = useCallback(async (sessionId: string) => {
        setFocusedTab(sessionId)
        try {
            await window.electron.focusSession(sessionId)
        } catch {
            // Non-critical
        }
    }, [setFocusedTab])

    /**
     * Quick-create a session with defaults (no dialog).
     * Uses current projectPath or settings.defaultProjectPath, and default permission mode.
     * Returns the created session, or null if no project path is available.
     */
    const quickCreateSession = useCallback(async () => {
        const path = useSessionStore.getState().projectPath
            || useSettingsStore.getState().settings.defaultProjectPath
        if (!path) {
            // No project selected — open Sessions panel so user can use the header project switcher
            useUIStore.getState().setActiveSidebarPanel('sessions')
            return null
        }

        const { defaultPermissionMode } = useSettingsStore.getState().settings
        return createSession({
            name: 'New Session',
            projectPath: path,
            permissionMode: defaultPermissionMode,
        })
    }, [createSession])

    /**
     * Refresh the session list from backend for the current project.
     */
    const refreshSessions = useCallback(async (path?: string) => {
        const targetPath = path ?? projectPath
        if (!targetPath) return
        try {
            const freshSessions = await window.electron.getSessions(targetPath)
            setSessions([...freshSessions])
        } catch (error) {
            console.error('Failed to refresh sessions:', error)
        }
    }, [projectPath, setSessions])

    return {
        switchSession,
        createSession,
        quickCreateSession,
        deleteSession,
        openSessionTab,
        closeSessionTab,
        focusSessionTab,
        refreshSessions,
        loading,
        sessions,
        currentSessionId,
    }
}
