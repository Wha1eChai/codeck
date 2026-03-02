import { useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useMessageStore } from '../stores/message-store'
import { useSettingsStore } from '../stores/settings-store'
import { useSessionState } from './useSessionState'
import type { Message } from '@common/types'

/**
 * Centralized application initialization hook.
 * Extracted from App.tsx to keep the root component thin.
 *
 * Handles:
 * 1. Settings loading (first)
 * 2. Session list loading (depends on defaultProjectPath)
 * 3. Theme application
 * 4. Backend session manager state sync
 */
export function useAppInit() {
    // 4. Start backend state synchronization
    useSessionState()

    const setSessions = useSessionStore(s => s.setSessions)
    const setProjectPath = useSessionStore(s => s.setProjectPath)
    const loadSettings = useSettingsStore(s => s.loadSettings)
    const settings = useSettingsStore(s => s.settings)

    // 1. Load settings on mount
    useEffect(() => {
        const load = async () => {
            try {
                await loadSettings()
            } catch {
                // Settings load failed — will use defaults
            }
        }
        load()
    }, [loadSettings])

    // 2. Load sessions and restore last session when settings become available
    const addTab = useSessionStore(s => s.addTab)
    const setCurrentSession = useSessionStore(s => s.setCurrentSession)

    useEffect(() => {
        const loadSessions = async () => {
            // Prefer lastProjectPath for restart recovery; fallback to defaultProjectPath
            const projectPath = settings.lastProjectPath || settings.defaultProjectPath
            if (!projectPath) return

            try {
                setProjectPath(projectPath)
                const sessions = await window.electron.getSessions(projectPath)
                setSessions([...sessions])

                // Auto-resume last active session if still present in the list
                if (settings.lastSessionId && sessions.some(s => s.id === settings.lastSessionId)) {
                    try {
                        const result = await window.electron.switchSession(settings.lastSessionId)
                        if (result.success && result.messages) {
                            const { setMessages } = useMessageStore.getState()
                            setMessages(settings.lastSessionId, result.messages as Message[])
                        }
                        // Open a tab for the restored session
                        const restoredSession = sessions.find(s => s.id === settings.lastSessionId)
                        if (restoredSession) {
                            addTab({ sessionId: restoredSession.id, name: restoredSession.name, status: 'idle' })
                            setCurrentSession(restoredSession.id)
                        }
                    } catch {
                        // Resume failed — user can manually pick a session
                    }
                }
            } catch {
                // Sessions load failed
            }
        }
        loadSessions()
    }, [settings.lastProjectPath, settings.defaultProjectPath, settings.lastSessionId, setProjectPath, setSessions, addTab, setCurrentSession])

    // 3. Apply theme + listen for system theme changes
    useEffect(() => {
        const root = document.documentElement

        const applyTheme = (prefersDark: boolean) => {
            root.classList.remove('dark', 'warm')

            if (settings.theme === 'warm') {
                root.classList.add('warm')
            } else {
                const isDark =
                    settings.theme === 'dark' ||
                    (settings.theme === 'system' && prefersDark)
                if (isDark) root.classList.add('dark')
            }
        }

        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        applyTheme(mq.matches)

        // Listen for OS theme changes when set to 'system'
        if (settings.theme === 'system') {
            const handler = (e: MediaQueryListEvent) => applyTheme(e.matches)
            mq.addEventListener('change', handler)
            return () => mq.removeEventListener('change', handler)
        }
    }, [settings.theme])
}
