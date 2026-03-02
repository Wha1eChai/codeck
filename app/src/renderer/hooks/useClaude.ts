import { useEffect, useCallback } from 'react'
import { ExecutionOptions, HookSettings, PermissionMode, PermissionResponse, AskUserQuestionResponse, ExitPlanModeResponse } from '@common/types'
import { useMessageStore } from '../stores/message-store'
import { useSessionStore } from '../stores/session-store'
import { useUIStore, permissionToPendingInteraction, askUserQuestionToPendingInteraction, exitPlanModeToPendingInteraction } from '../stores/ui-store'

/**
 * Global IPC bridge for Claude stream events.
 * Should be mounted once at app root to avoid duplicate subscriptions.
 */
export function useClaudeEvents() {
  const addMessage = useMessageStore(s => s.addMessage)
  const syncStatus = useSessionStore(s => s.syncStatus)
  const setPendingInteraction = useUIStore(s => s.setPendingInteraction)

  useEffect(() => {
    // Keep one stable subscription for the renderer lifecycle so switching
    // sessions does not create a brief unsubscribe window that can drop events.
    const unsubMsg = window.electron.onClaudeMessage((msg) => {
      addMessage(msg.sessionId, msg)
    })

    const unsubStatus = window.electron.onSessionStatus((state) => {
      syncStatus(state)
    })

    const unsubPerm = window.electron.onPermissionRequest((req) => {
      setPendingInteraction(permissionToPendingInteraction(req))
    })

    const unsubAskUser = window.electron.onAskUserQuestion((req) => {
      setPendingInteraction(askUserQuestionToPendingInteraction(req))
    })

    const unsubExitPlan = window.electron.onExitPlanMode((req) => {
      setPendingInteraction(exitPlanModeToPendingInteraction(req))
    })

    return () => {
      unsubMsg()
      unsubStatus()
      unsubPerm()
      unsubAskUser()
      unsubExitPlan()
    }
  }, [addMessage, syncStatus, setPendingInteraction])
}

export function useClaude(sessionId: string | null) {
  const addMessage = useMessageStore(s => s.addMessage)
  const syncStatus = useSessionStore(s => s.syncStatus)

  const sendMessage = useCallback(async (
    content: string,
    permissionMode?: PermissionMode,
    executionOptions?: ExecutionOptions,
    hookSettings?: HookSettings,
  ) => {
    if (!sessionId) return

    // 立即在本地显示用户消息
    addMessage(sessionId, {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      role: 'user',
      type: 'text',
      content,
      timestamp: Date.now(),
    })

    try {
      await window.electron.sendMessage(sessionId, content, permissionMode, executionOptions, hookSettings)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncStatus({ sessionId, status: 'error', error: message })
    }
  }, [sessionId, addMessage, syncStatus])

  const abort = useCallback(async () => {
    if (!sessionId) return
    try {
      await window.electron.abort(sessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncStatus({ sessionId, status: 'error', error: message })
    }
  }, [sessionId, syncStatus])

  const respondPermission = useCallback(async (response: PermissionResponse) => {
    try {
      await window.electron.respondPermission(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncStatus({ sessionId: sessionId || '', status: 'error', error: message })
    }
  }, [sessionId, syncStatus])

  const respondAskUserQuestion = useCallback(async (response: AskUserQuestionResponse) => {
    try {
      await window.electron.respondAskUserQuestion(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncStatus({ sessionId: sessionId || '', status: 'error', error: message })
    }
  }, [sessionId, syncStatus])

  const respondExitPlanMode = useCallback(async (response: ExitPlanModeResponse) => {
    try {
      await window.electron.respondExitPlanMode(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncStatus({ sessionId: sessionId || '', status: 'error', error: message })
    }
  }, [sessionId, syncStatus])

  return {
    sendMessage,
    abort,
    respondPermission,
    respondAskUserQuestion,
    respondExitPlanMode,
  }
}
