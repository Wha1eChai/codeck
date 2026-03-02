import { ipcMain } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  permissionResponseSchema,
  askUserQuestionResponseSchema,
  exitPlanModeResponseSchema,
  sendMessageSchema,
  focusSessionSchema,
  closeSessionTabSchema,
} from '@common/schemas';
import { sessionOrchestrator } from '../session-orchestrator';

import type { BrowserWindow } from 'electron';

export function registerClaudeHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(
    RENDERER_TO_MAIN.SEND_MESSAGE,
    async (_, sessionId: unknown, content: unknown, permissionMode?: unknown, executionOptions?: unknown, hookSettings?: unknown) => {
      const validated = sendMessageSchema.parse({ sessionId, content, permissionMode, executionOptions, hookSettings });

      const win = getMainWindow();
      if (!win) throw new Error('No active window');

      await sessionOrchestrator.sendMessage(win, {
        sessionId: validated.sessionId,
        content: validated.content,
        permissionMode: validated.permissionMode,
        executionOptions: validated.executionOptions,
        hookSettings: validated.hookSettings,
      });
    },
  );

  ipcMain.handle(RENDERER_TO_MAIN.ABORT, async (_, sessionId?: unknown) => {
    if (sessionId && typeof sessionId === 'string') {
      sessionOrchestrator.abortSession(sessionId);
    } else {
      sessionOrchestrator.abort();
    }
  });

  ipcMain.handle(RENDERER_TO_MAIN.ABORT_SESSION, async (_, payload: unknown) => {
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(payload);
    sessionOrchestrator.abortSession(sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.FOCUS_SESSION, async (_, sessionId: unknown) => {
    const validated = focusSessionSchema.parse(typeof sessionId === 'string' ? { sessionId } : sessionId);
    await sessionOrchestrator.focusSession(validated.sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.CLOSE_SESSION_TAB, async (_, sessionId: unknown) => {
    const validated = closeSessionTabSchema.parse(typeof sessionId === 'string' ? { sessionId } : sessionId);
    await sessionOrchestrator.closeSessionTab(validated.sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.PERMISSION_RESPONSE, async (_, response: unknown) => {
    const validated = permissionResponseSchema.parse(response);
    sessionOrchestrator.resolvePermission(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.ASK_USER_QUESTION_RESPONSE, async (_, response: unknown) => {
    const validated = askUserQuestionResponseSchema.parse(response);
    sessionOrchestrator.resolveAskUserQuestion(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.EXIT_PLAN_MODE_RESPONSE, async (_, response: unknown) => {
    const validated = exitPlanModeResponseSchema.parse(response);
    sessionOrchestrator.resolveExitPlanMode(validated);
  });
}
