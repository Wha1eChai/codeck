import { ipcMain } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN, MAIN_TO_RENDERER } from '@common/ipc-channels';
import { SESSIONS_SERVER_URL, triggerSync } from '../sessions-server';

import type { BrowserWindow } from 'electron';

export function registerHistoryHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(RENDERER_TO_MAIN.TRIGGER_SYNC, async () => {
    const result = await triggerSync();
    const win = getMainWindow();
    if (win && result) win.webContents.send(MAIN_TO_RENDERER.SYNC_COMPLETED, result);
    return result;
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_ALL_SESSIONS, async () => {
    const res = await fetch(`${SESSIONS_SERVER_URL}/api/history`);
    return res.json();
  });

  ipcMain.handle(RENDERER_TO_MAIN.SEARCH_SESSIONS, async (_, query: unknown) => {
    const validated = z.string().parse(query);
    const res = await fetch(
      `${SESSIONS_SERVER_URL}/api/history/search?q=${encodeURIComponent(validated)}`
    );
    return res.json();
  });
}
