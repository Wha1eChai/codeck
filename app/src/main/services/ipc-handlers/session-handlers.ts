import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  createSessionSchema,
  sessionIdSchema,
} from '@common/schemas';
import { sessionOrchestrator } from '../session-orchestrator';
import { createHandler, createValidatedHandler, createWindowValidatedHandler } from './create-handler';

import type { BrowserWindow } from 'electron';

export function registerSessionHandlers(getMainWindow: () => BrowserWindow | null) {
  createWindowValidatedHandler(RENDERER_TO_MAIN.SWITCH_SESSION, {
    schema: sessionIdSchema,
    window: getMainWindow,
    handle: async (win, sessionId) => {
      const { session, messages } = await sessionOrchestrator.switchSession(win, sessionId);
      return { success: true, session, messages };
    },
  });

  createHandler(RENDERER_TO_MAIN.SCAN_PROJECTS, {
    handle: () => sessionOrchestrator.scanProjects(),
  });

  createValidatedHandler(RENDERER_TO_MAIN.NOTIFY_PROJECT_SELECTED, {
    schema: z.string().min(1),
    handle: (projectPath) => sessionOrchestrator.onProjectSelected(projectPath),
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_SESSIONS, {
    schema: z.string().min(1).optional(),
    handle: (targetPath) => sessionOrchestrator.listSessions(targetPath),
  });

  createValidatedHandler(RENDERER_TO_MAIN.CREATE_SESSION, {
    schema: createSessionSchema,
    handle: (validated) => sessionOrchestrator.createSession(validated),
  });

  createValidatedHandler(RENDERER_TO_MAIN.RESUME_SESSION, {
    schema: sessionIdSchema,
    handle: async (sessionId) => {
      const { session, messages } = await sessionOrchestrator.resumeSession(sessionId);
      return { success: true, session, messages };
    },
  });

  createValidatedHandler(RENDERER_TO_MAIN.DELETE_SESSION, {
    schema: sessionIdSchema,
    handle: (sessionId) => sessionOrchestrator.deleteSession(sessionId),
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_SESSION_MESSAGES, {
    schema: sessionIdSchema,
    handle: (sessionId) => sessionOrchestrator.getSessionMessages(sessionId),
  });
}
