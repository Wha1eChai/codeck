import { BrowserWindow, ipcMain, dialog } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN, MAIN_TO_RENDERER } from '@common/ipc-channels';
import {
  createSessionSchema,
  permissionResponseSchema,
  askUserQuestionResponseSchema,
  exitPlanModeResponseSchema,
  sendMessageSchema,
  sessionIdSchema,
  updatePreferencesSchema,
  focusSessionSchema,
  closeSessionTabSchema,
  mergeWorktreeSchema,
  removeWorktreeSchema,
  getWorktreeDiffSchema,
} from '@common/schemas';
import {
  toPluginInfo,
  toAgentInfo,
  toMcpServerInfo,
  toMemoryFileInfo,
  toCliHooks,
} from '@codeck/config';
import { appPreferencesService } from './app-preferences';
import { runCcusage, warmUsageCache, invalidateUsageCache } from './ccusage-runner';
import { configReader, getConfigWriter, getProjectPath } from './config-bridge';
import { SESSIONS_SERVER_URL, triggerSync, debouncedSync } from './sessions-server';
import { sessionOrchestrator } from './session-orchestrator';
import { sessionManager } from './session';
import { worktreeService } from './worktree-service';
import type { AppPreferences } from '@common/types';

// Session orchestration/state is managed by sessionOrchestrator

// Getter to resolve the current active window safely.
let getMainWindow: () => BrowserWindow | null;

export function registerIpcHandlers(windowGetter: () => BrowserWindow | null) {
  getMainWindow = windowGetter;

  // Subscribe to multi-session state changes (single source of truth)
  let lastFocusedStatus: string | null = null;
  sessionManager.subscribeMulti((multiState) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(MAIN_TO_RENDERER.MULTI_SESSION_STATE_CHANGED, multiState);
    }

    // Usage cache refresh: detect focused session streaming→idle
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

  // 启动时后台预热 usage 缓存（不阻塞 IPC 注册）
  warmUsageCache().catch(console.error);

  // ── Dialogs ──

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

  // ── History (global session browsing — served by @codeck/sessions) ──

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

  ipcMain.handle(RENDERER_TO_MAIN.NOTIFY_PROJECT_SELECTED, async (_, projectPath: unknown) => {
    const validated = z.string().min(1).parse(projectPath);
    await sessionOrchestrator.onProjectSelected(validated);
  });

  // ── Session Management ──

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

  // ── Claude Interaction ──

  ipcMain.handle(
    RENDERER_TO_MAIN.SEND_MESSAGE,
    async (_, sessionId: unknown, content: unknown, permissionMode?: unknown, executionOptions?: unknown, hookSettings?: unknown) => {
      const validated = sendMessageSchema.parse({ sessionId, content, permissionMode, executionOptions, hookSettings });

      const win = getMainWindow();
      if (!win) throw new Error('No active window');

      await sessionOrchestrator.sendMessage(win, {
        sessionId: validated.sessionId,
        content: validated.content,
        permissionMode: validated.permissionMode,
        executionOptions: validated.executionOptions,
        hookSettings: validated.hookSettings,
      });
    },
  );

  ipcMain.handle(RENDERER_TO_MAIN.ABORT, async (_, sessionId?: unknown) => {
    if (sessionId && typeof sessionId === 'string') {
      sessionOrchestrator.abortSession(sessionId);
    } else {
      sessionOrchestrator.abort();
    }
  });

  ipcMain.handle(RENDERER_TO_MAIN.ABORT_SESSION, async (_, payload: unknown) => {
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(payload);
    sessionOrchestrator.abortSession(sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.FOCUS_SESSION, async (_, sessionId: unknown) => {
    const validated = focusSessionSchema.parse(typeof sessionId === 'string' ? { sessionId } : sessionId);
    await sessionOrchestrator.focusSession(validated.sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.CLOSE_SESSION_TAB, async (_, sessionId: unknown) => {
    const validated = closeSessionTabSchema.parse(typeof sessionId === 'string' ? { sessionId } : sessionId);
    await sessionOrchestrator.closeSessionTab(validated.sessionId);
  });

  ipcMain.handle(RENDERER_TO_MAIN.PERMISSION_RESPONSE, async (_, response: unknown) => {
    const validated = permissionResponseSchema.parse(response);
    sessionOrchestrator.resolvePermission(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.ASK_USER_QUESTION_RESPONSE, async (_, response: unknown) => {
    const validated = askUserQuestionResponseSchema.parse(response);
    sessionOrchestrator.resolveAskUserQuestion(validated);
  });

  ipcMain.handle(RENDERER_TO_MAIN.EXIT_PLAN_MODE_RESPONSE, async (_, response: unknown) => {
    const validated = exitPlanModeResponseSchema.parse(response);
    sessionOrchestrator.resolveExitPlanMode(validated);
  });

  // ── Settings ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_SETTINGS, async () => {
    return appPreferencesService.get();
  });

  ipcMain.handle(RENDERER_TO_MAIN.UPDATE_SETTINGS, async (_, settings: unknown) => {
    const validated = updatePreferencesSchema.parse(settings);
    await appPreferencesService.update(validated as Partial<AppPreferences>);
  });

  // ── Checkpoint ──

  ipcMain.handle(RENDERER_TO_MAIN.CHECKPOINT_REWIND, async (_, sessionId: unknown, userMessageId: unknown, dryRun?: unknown) => {
    const sid = z.string().min(1).parse(sessionId);
    const id = z.string().min(1).parse(userMessageId);
    const dry = typeof dryRun === 'boolean' ? dryRun : false;
    return sessionOrchestrator.rewindFiles(sid, id, dry);
  });

  // ── File Explorer ──

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

  // ── CLI Config (env) ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_ENV_VARS, async () => {
    const resolved = await configReader.getResolvedSettings(getProjectPath());
    return resolved.env ?? {};
  });

  ipcMain.handle(RENDERER_TO_MAIN.SET_ENV_VAR, async (_, name: unknown, value: unknown) => {
    const validName = z.string().min(1).parse(name);
    const validValue = z.string().parse(value);
    await getConfigWriter().setEnvVar('user', validName, validValue);
  });

  ipcMain.handle(RENDERER_TO_MAIN.REMOVE_ENV_VAR, async (_, name: unknown) => {
    const validName = z.string().min(1).parse(name);
    await getConfigWriter().removeEnvVar('user', validName);
  });

  // ── Phase 3: Plugins ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_PLUGINS, async () => {
    const plugins = await configReader.getResolvedPlugins(getProjectPath());
    return plugins.map(toPluginInfo);
  });

  ipcMain.handle(RENDERER_TO_MAIN.SET_PLUGIN_ENABLED, async (_, pluginId: unknown, enabled: unknown) => {
    const validId = z.string().min(1).parse(pluginId);
    const validEnabled = z.boolean().parse(enabled);
    await getConfigWriter().setPluginEnabled(validId, validEnabled);
  });

  // ── Phase 3: Agents & Skills ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_AGENTS, async () => {
    const agents = await configReader.getAllAgents(getProjectPath());
    return agents.map(toAgentInfo);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_AGENT_CONTENT, async (_, filename: unknown) => {
    const validated = z.string().min(1).parse(filename);
    const agents = await configReader.getAllAgents(getProjectPath());
    const match = agents.find((a) => a.filename === validated);
    if (!match) throw new Error(`Agent not found: ${validated}`);
    return match.body;
  });

  // ── Phase 3: MCP Servers ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_MCP_SERVERS, async () => {
    const servers = await configReader.getMcpServers(getProjectPath());
    return servers.map(toMcpServerInfo);
  });

  ipcMain.handle(RENDERER_TO_MAIN.UPDATE_MCP_SERVER, async (_, scope: unknown, name: unknown, config: unknown) => {
    const validScope = z.enum(['user', 'project']).parse(scope);
    const validName = z.string().min(1).parse(name);
    const validConfig = z.object({
      command: z.string().min(1),
      args: z.array(z.string()),
      env: z.record(z.string(), z.string()).optional(),
    }).parse(config);
    await getConfigWriter().upsertMcpServer(validScope, validName, {
      command: validConfig.command,
      args: validConfig.args,
      env: validConfig.env,
    });
  });

  ipcMain.handle(RENDERER_TO_MAIN.REMOVE_MCP_SERVER, async (_, scope: unknown, name: unknown) => {
    const validScope = z.enum(['user', 'project']).parse(scope);
    const validName = z.string().min(1).parse(name);
    await getConfigWriter().removeMcpServer(validScope, validName);
  });

  // ── Phase 3: CLI Hooks ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_CLI_HOOKS, async () => {
    const resolved = await configReader.getEffectiveHooks(getProjectPath());
    return toCliHooks(resolved);
  });

  ipcMain.handle(RENDERER_TO_MAIN.UPDATE_CLI_HOOKS, async (_, hooks: unknown) => {
    const validated = z.record(z.string(), z.array(z.object({
      matcher: z.string(),
      hooks: z.array(z.object({
        type: z.literal('command'),
        command: z.string(),
        timeout: z.number().optional(),
        timeout_ms: z.number().optional(),
        statusMessage: z.string().optional(),
        async: z.boolean().optional(),
        description: z.string().optional(),
      })),
      description: z.string().optional(),
    }))).parse(hooks);
    await getConfigWriter().writeSettingsKey('user', 'hooks', validated);
  });

  // ── Usage 统计（ccusage） ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_USAGE_STATS, async (_, command: unknown) => {
    const validated = z.enum(['daily', 'monthly', 'session']).parse(command);
    return runCcusage(validated);
  });

  // ── Phase 3: Memory ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_MEMORY_FILES, async () => {
    const files = await configReader.getClaudeMdFiles(getProjectPath());
    return files.map(toMemoryFileInfo);
  });

  ipcMain.handle(RENDERER_TO_MAIN.GET_MEMORY_CONTENT, async (_, filePath: unknown) => {
    const validated = z.string().min(1).parse(filePath);
    const files = await configReader.getClaudeMdFiles(getProjectPath());
    const match = files.find((f) => f.filePath === validated);
    if (!match) throw new Error(`Memory file not found: ${validated}`);
    return match.content;
  });

  ipcMain.handle(RENDERER_TO_MAIN.UPDATE_MEMORY_CONTENT, async (_, filePath: unknown, content: unknown) => {
    const validPath = z.string().min(1).parse(filePath);
    const validContent = z.string().parse(content);
    await getConfigWriter().writeMemoryContent(validPath, validContent);
  });

  // ── Git Info ──

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

  // ── Worktree Management ──

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
