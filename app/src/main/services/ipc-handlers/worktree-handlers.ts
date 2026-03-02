import { ipcMain } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  mergeWorktreeSchema,
  removeWorktreeSchema,
  getWorktreeDiffSchema,
} from '@common/schemas';
import { sessionOrchestrator } from '../session-orchestrator';
import { sessionManager } from '../session';
import { worktreeService } from '../worktree-service';

export function registerWorktreeHandlers() {
  ipcMain.handle(RENDERER_TO_MAIN.CHECKPOINT_REWIND, async (_, sessionId: unknown, userMessageId: unknown, dryRun?: unknown) => {
    const sid = z.string().min(1).parse(sessionId);
    const id = z.string().min(1).parse(userMessageId);
    const dry = typeof dryRun === 'boolean' ? dryRun : false;
    return sessionOrchestrator.rewindFiles(sid, id, dry);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_WORKTREES, async (_, projectPath: unknown) => {
    const validated = z.string().min(1).parse(projectPath);
    return worktreeService.listWorktrees(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.MERGE_WORKTREE, async (_, payload: unknown) => {
    const { sessionId, worktreeBranch, baseBranch } = mergeWorktreeSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    const result = await worktreeService.mergeWorktree(projectPath, worktreeBranch, baseBranch);
    if (result.success) {
      // Clean up worktree after successful merge
      await worktreeService.removeWorktree(projectPath, sessionId);
      sessionManager.removeSessionWorktree(projectPath, sessionId);
    }
    return result;
  });

  ipcMain.handle(RENDERER_TO_MAIN.REMOVE_WORKTREE, async (_, payload: unknown) => {
    const { sessionId } = removeWorktreeSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    await worktreeService.removeWorktree(projectPath, sessionId);
    sessionManager.removeSessionWorktree(projectPath, sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_WORKTREE_DIFF, async (_, payload: unknown) => {
    const { baseBranch, worktreeBranch } = getWorktreeDiffSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    return worktreeService.getWorktreeDiff(projectPath, baseBranch, worktreeBranch);
  });
}
