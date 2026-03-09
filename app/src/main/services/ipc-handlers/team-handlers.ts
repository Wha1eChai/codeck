import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  createChildSessionSchema,
  teamTreeSchema,
  sendToChildSchema,
} from '@common/schemas';
import { sessionOrchestrator } from '../session-orchestrator';
import { createValidatedHandler, createWindowValidatedHandler } from './create-handler';

import type { BrowserWindow } from 'electron';
import type { PermissionMode } from '@common/types';

export function registerTeamHandlers(getMainWindow: () => BrowserWindow | null) {
  createValidatedHandler(RENDERER_TO_MAIN.CREATE_CHILD_SESSION, {
    schema: createChildSessionSchema,
    handle: (validated) =>
      sessionOrchestrator.createChildSession(validated.parentSessionId, {
        name: validated.name,
        role: validated.role,
        projectPath: validated.projectPath,
        permissionMode: validated.permissionMode as PermissionMode,
        useWorktree: validated.useWorktree,
      }),
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_TEAM_TREE, {
    schema: teamTreeSchema,
    handle: (validated) => sessionOrchestrator.getTeamTree(validated.sessionId),
  });

  createWindowValidatedHandler(RENDERER_TO_MAIN.SEND_TO_CHILD, {
    schema: sendToChildSchema,
    window: getMainWindow,
    handle: (win, validated) =>
      sessionOrchestrator.sendMessageToChild(
        win,
        validated.parentSessionId,
        validated.childSessionId,
        validated.content,
      ),
  });
}
