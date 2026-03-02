import { ipcMain } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  createSessionSchema,
  sessionIdSchema,
} from '@common/schemas';
import { sessionOrchestrator } from '../session-orchestrator';

import type { BrowserWindow } from 'electron';

export function registerSessionHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(RENDERER_TO_MAIN.SWITCH_SESSION, async (_, sessionId: unknown) => {
    const validated = sessionIdSchema.parse(sessionId);
    const win = getMainWindow();
    if (!win) throw new Error('No active window');
    const { session, messages } = await sessionOrchestrator.switchSession(win, validated);
    return { success: true, session, messages };
  });

  ipcMain.handle(RENDERER_TO_MAIN.SCAN_PROJECTS, async () => {
    return sessionOrchestrator.scanProjects();
  });

  ipcMain.handle(RENDERER_TO_MAIN.NOTIFY_PROJECT_SELECTED, async (_, projectPath: unknown) => {
    const validated = z.string().min(1).parse(projectPath);
    await sessionOrchestrator.onProjectSelected(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_SESSIONS, async (_, projectPath?: unknown) => {
    const targetPath = projectPath ? z.string().min(1).parse(projectPath) : undefined;
    return sessionOrchestrator.listSessions(targetPath);
  });

  ipcMain.handle(RENDERER_TO_MAIN.CREATE_SESSION, async (_, input: unknown) => {
    const validated = createSessionSchema.parse(input);
    const session = await sessionOrchestrator.createSession(validated);
    return session;
  });

  ipcMain.handle(RENDERER_TO_MAIN.RESUME_SESSION, async (_, sessionId: unknown) => {
    const validated = sessionIdSchema.parse(sessionId);
    const { session, messages } = await sessionOrchestrator.resumeSession(validated);

    return { success: true, session, messages };
  });

  ipcMain.handle(RENDERER_TO_MAIN.DELETE_SESSION, async (_, sessionId: unknown) => {
    const validated = sessionIdSchema.parse(sessionId);
    await sessionOrchestrator.deleteSession(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_SESSION_MESSAGES, async (_, sessionId: unknown) => {
    const validated = sessionIdSchema.parse(sessionId);
    return sessionOrchestrator.getSessionMessages(validated);
  });
}
