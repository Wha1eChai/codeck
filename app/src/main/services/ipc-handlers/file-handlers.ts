import { ipcMain, dialog } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import { sessionOrchestrator } from '../session-orchestrator';

import type { BrowserWindow } from 'electron';

export function registerFileHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(RENDERER_TO_MAIN.SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const selectedPath = result.filePaths[0];
    await sessionOrchestrator.onProjectSelected(selectedPath);
    return selectedPath;
  });

  ipcMain.handle(RENDERER_TO_MAIN.LIST_DIRECTORY, async (_, dirPath: unknown) => {
    const validated = z.string().min(1).parse(dirPath);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const IGNORED = new Set([
      'node_modules', '.git', 'dist', 'out', '.next', '.nuxt',
      '.cache', '.turbo', '__pycache__', '.venv', 'venv',
      'coverage', '.DS_Store',
    ]);

    try {
      const entries = await fs.readdir(validated, { withFileTypes: true });
      const result = entries
        .filter(e => !e.name.startsWith('.') || e.name === '.claude')
        .filter(e => !IGNORED.has(e.name))
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })
        .map(e => ({
          name: e.name,
          path: path.join(validated, e.name),
          isDirectory: e.isDirectory(),
        }));
      return result;
    } catch {
      return [];
    }
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_GIT_BRANCH, async (_, projectPath: unknown) => {
    const validated = z.string().min(1).parse(projectPath);
    try {
      const { execSync } = await import('node:child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: validated,
        timeout: 3000,
        encoding: 'utf-8',
      }).trim();
      return branch || null;
    } catch {
      return null;
    }
  });
}
