import type { BrowserWindow } from 'electron';
import { MAIN_TO_RENDERER } from '@common/ipc-channels';
import { warmUsageCache, invalidateUsageCache } from '../ccusage-runner';
import { debouncedSync } from '../sessions-server';
import { sessionManager } from '../session';
import { registerSessionHandlers } from './session-handlers';
import { registerClaudeHandlers } from './claude-handlers';
import { registerHistoryHandlers } from './history-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerConfigHandlers } from './config-handlers';
import { registerFileHandlers } from './file-handlers';
import { registerWorktreeHandlers } from './worktree-handlers';

export function registerIpcHandlers(windowGetter: () => BrowserWindow | null) {
  const getMainWindow = windowGetter;

  // Subscribe to multi-session state changes (single source of truth)
  let lastFocusedStatus: string | null = null;
  sessionManager.subscribeMulti((multiState) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(MAIN_TO_RENDERER.MULTI_SESSION_STATE_CHANGED, multiState);
    }

    // Usage cache refresh: detect focused session streaming->idle
    const focusedId = multiState.focusedSessionId;
    const focusedStatus = focusedId
      ? multiState.activeSessions[focusedId]?.status ?? null
      : null;
    if (lastFocusedStatus === 'streaming' && focusedStatus === 'idle') {
      invalidateUsageCache();
      warmUsageCache()
        .then(() => {
          const w = getMainWindow();
          if (w) w.webContents.send(MAIN_TO_RENDERER.USAGE_STATS_UPDATED);
        })
        .catch(console.error);

      // Refresh sessions-server DB after session ends
      debouncedSync();
    }
    lastFocusedStatus = focusedStatus;
  });

  // Background usage cache warmup (non-blocking)
  warmUsageCache().catch(console.error);

  // Register all domain handlers
  registerSessionHandlers(getMainWindow);
  registerClaudeHandlers(getMainWindow);
  registerHistoryHandlers(getMainWindow);
  registerSettingsHandlers();
  registerConfigHandlers();
  registerFileHandlers(getMainWindow);
  registerWorktreeHandlers();
}
