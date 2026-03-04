import type { BrowserWindow } from 'electron';
import { MAIN_TO_RENDERER } from '@common/ipc-channels';
import { warmUsageCache, invalidateUsageCache } from '../ccusage-runner';
import { debouncedSync } from '../sessions-server';
import { sessionManager } from '../session';
import { createLogger } from '../logger';

const logger = createLogger('ipc');
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
  let lastSessionStatuses: Record<string, string> = {};
  sessionManager.subscribeMulti((multiState) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(MAIN_TO_RENDERER.MULTI_SESSION_STATE_CHANGED, multiState);
    }

    // Usage cache refresh: detect ANY session streaming->idle (not just focused)
    let anySessionEnded = false;
    for (const [sessionId, state] of Object.entries(multiState.activeSessions)) {
      const prevStatus = lastSessionStatuses[sessionId];
      if (prevStatus === 'streaming' && state.status === 'idle') {
        anySessionEnded = true;
      }
    }

    if (anySessionEnded) {
      invalidateUsageCache();
      warmUsageCache()
        .then(() => {
          const w = getMainWindow();
          if (w) w.webContents.send(MAIN_TO_RENDERER.USAGE_STATS_UPDATED);
        })
        .catch((err) => logger.error('usage cache warmup after session end failed:', err));

      // Refresh sessions-server DB after session ends
      debouncedSync();
    }

    // Snapshot current statuses for next comparison
    lastSessionStatuses = {};
    for (const [sessionId, state] of Object.entries(multiState.activeSessions)) {
      lastSessionStatuses[sessionId] = state.status;
    }
  });

  // Background usage cache warmup (non-blocking)
  warmUsageCache().catch((err) => logger.error('initial usage cache warmup failed:', err));

  // Register all domain handlers
  registerSessionHandlers(getMainWindow);
  registerClaudeHandlers(getMainWindow);
  registerHistoryHandlers(getMainWindow);
  registerSettingsHandlers();
  registerConfigHandlers();
  registerFileHandlers(getMainWindow);
  registerWorktreeHandlers();
}
