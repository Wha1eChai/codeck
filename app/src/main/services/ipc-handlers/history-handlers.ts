import { z } from 'zod';
import { RENDERER_TO_MAIN, MAIN_TO_RENDERER } from '@common/ipc-channels';
import { SESSIONS_SERVER_URL, triggerSync } from '../sessions-server';
import { createHandler, createValidatedHandler, createWindowHandler } from './create-handler';

import type { BrowserWindow } from 'electron';

export function registerHistoryHandlers(getMainWindow: () => BrowserWindow | null) {
  createWindowHandler(RENDERER_TO_MAIN.TRIGGER_SYNC, {
    window: getMainWindow,
    handle: async (win) => {
      const result = await triggerSync();
      if (result) win.webContents.send(MAIN_TO_RENDERER.SYNC_COMPLETED, result);
      return result;
    },
  });

  createHandler(RENDERER_TO_MAIN.GET_ALL_SESSIONS, {
    handle: async () => {
      const res = await fetch(`${SESSIONS_SERVER_URL}/api/history`);
      return res.json();
    },
  });

  createValidatedHandler(RENDERER_TO_MAIN.SEARCH_SESSIONS, {
    schema: z.string(),
    handle: async (query) => {
      const res = await fetch(
        `${SESSIONS_SERVER_URL}/api/history/search?q=${encodeURIComponent(query)}`,
      );
      return res.json();
    },
  });
}
