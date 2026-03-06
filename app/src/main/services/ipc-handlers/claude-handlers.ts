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
import { createValidatedHandler, createMultiArgWindowHandler } from './create-handler';

import type { BrowserWindow } from 'electron';

export function registerClaudeHandlers(getMainWindow: () => BrowserWindow | null) {
  // SEND_MESSAGE — multi-arg + window, uses factory
  createMultiArgWindowHandler(RENDERER_TO_MAIN.SEND_MESSAGE, {
    schema: sendMessageSchema,
    window: getMainWindow,
    mapArgs: (sessionId, content, permissionMode, executionOptions, hookSettings, images) => ({
      sessionId,
      content,
      permissionMode,
      executionOptions,
      hookSettings,
      images,
    }),
    handle: (win, validated) => sessionOrchestrator.sendMessage(win, {
      sessionId: validated.sessionId,
      content: validated.content,
      permissionMode: validated.permissionMode,
      executionOptions: validated.executionOptions,
      hookSettings: validated.hookSettings,
      images: validated.images,
    }),
  });

  // ABORT — conditional logic, kept manual
  ipcMain.handle(RENDERER_TO_MAIN.ABORT, async (_, sessionId?: unknown) => {
    if (sessionId && typeof sessionId === 'string') {
      sessionOrchestrator.abortSession(sessionId);
    } else {
      sessionOrchestrator.abort();
    }
  });

  createValidatedHandler(RENDERER_TO_MAIN.ABORT_SESSION, {
    schema: z.object({ sessionId: z.string().min(1) }),
    handle: ({ sessionId }) => sessionOrchestrator.abortSession(sessionId),
  });

  createValidatedHandler(RENDERER_TO_MAIN.FOCUS_SESSION, {
    schema: focusSessionSchema,
    handle: (validated) => sessionOrchestrator.focusSession(validated.sessionId),
  });

  createValidatedHandler(RENDERER_TO_MAIN.CLOSE_SESSION_TAB, {
    schema: closeSessionTabSchema,
    handle: (validated) => sessionOrchestrator.closeSessionTab(validated.sessionId),
  });

  createValidatedHandler(RENDERER_TO_MAIN.PERMISSION_RESPONSE, {
    schema: permissionResponseSchema,
    handle: (validated) => sessionOrchestrator.resolvePermission(validated),
  });

  createValidatedHandler(RENDERER_TO_MAIN.ASK_USER_QUESTION_RESPONSE, {
    schema: askUserQuestionResponseSchema,
    handle: (validated) => sessionOrchestrator.resolveAskUserQuestion(validated),
  });

  createValidatedHandler(RENDERER_TO_MAIN.EXIT_PLAN_MODE_RESPONSE, {
    schema: exitPlanModeResponseSchema,
    handle: (validated) => sessionOrchestrator.resolveExitPlanMode(validated),
  });
}
