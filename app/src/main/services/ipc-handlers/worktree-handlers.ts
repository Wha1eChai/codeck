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
import { createValidatedHandler, createMultiArgHandler } from './create-handler';

const checkpointRewindSchema = z.object({
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  dryRun: z.boolean(),
});

export function registerWorktreeHandlers() {
  createMultiArgHandler(RENDERER_TO_MAIN.CHECKPOINT_REWIND, {
    schema: checkpointRewindSchema,
    mapArgs: (sessionId, userMessageId, dryRun) => ({
      sessionId,
      userMessageId,
      dryRun: typeof dryRun === 'boolean' ? dryRun : false,
    }),
    handle: (v) => sessionOrchestrator.rewindFiles(v.sessionId, v.userMessageId, v.dryRun),
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_WORKTREES, {
    schema: z.string().min(1),
    handle: (projectPath) => worktreeService.listWorktrees(projectPath),
  });

  // MERGE_WORKTREE — complex (multi-step with side effects), kept manual
  ipcMain.handle(RENDERER_TO_MAIN.MERGE_WORKTREE, async (_, payload: unknown) => {
    const { sessionId, worktreeBranch, baseBranch } = mergeWorktreeSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    const result = await worktreeService.mergeWorktree(projectPath, worktreeBranch, baseBranch);
    if (result.success) {
      await worktreeService.removeWorktree(projectPath, sessionId);
      sessionManager.removeSessionWorktree(projectPath, sessionId);
    }
    return result;
  });

  // REMOVE_WORKTREE — complex (needs projectPath + cleanup), kept manual
  ipcMain.handle(RENDERER_TO_MAIN.REMOVE_WORKTREE, async (_, payload: unknown) => {
    const { sessionId } = removeWorktreeSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    await worktreeService.removeWorktree(projectPath, sessionId);
    sessionManager.removeSessionWorktree(projectPath, sessionId);
  });

  // GET_WORKTREE_DIFF — needs projectPath guard, kept manual
  ipcMain.handle(RENDERER_TO_MAIN.GET_WORKTREE_DIFF, async (_, payload: unknown) => {
    const { baseBranch, worktreeBranch } = getWorktreeDiffSchema.parse(payload);
    const projectPath = sessionManager.getCurrentProjectPath();
    if (!projectPath) throw new Error('No project selected');

    return worktreeService.getWorktreeDiff(projectPath, baseBranch, worktreeBranch);
  });
}
