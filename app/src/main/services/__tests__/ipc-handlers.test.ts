import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import type { Message, Session } from '@common/types';

const { handle, showOpenDialog } = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}));

const mockConfigReader = vi.hoisted(() => ({
  getResolvedSettings: vi.fn().mockResolvedValue({ env: {} }),
  getResolvedPlugins: vi.fn().mockResolvedValue([]),
  getAllAgents: vi.fn().mockResolvedValue([]),
  getMcpServers: vi.fn().mockResolvedValue([]),
  getEffectiveHooks: vi.fn().mockResolvedValue({}),
  getClaudeMdFiles: vi.fn().mockResolvedValue([]),
}));

const mockConfigWriter = vi.hoisted(() => ({
  setEnvVar: vi.fn(),
  removeEnvVar: vi.fn(),
  setPluginEnabled: vi.fn(),
  upsertMcpServer: vi.fn(),
  removeMcpServer: vi.fn(),
  writeSettingsKey: vi.fn(),
  writeMemoryContent: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle,
  },
  dialog: {
    showOpenDialog,
  },
  BrowserWindow: class { },
}));

vi.mock('../app-preferences', () => ({
  appPreferencesService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../config-bridge', () => ({
  configReader: mockConfigReader,
  getConfigWriter: () => mockConfigWriter,
  getProjectPath: () => '/mock/project',
}));

vi.mock('@codeck/config', () => ({
  toPluginInfo: vi.fn((p: unknown) => p),
  toAgentInfo: vi.fn((a: unknown) => a),
  toMcpServerInfo: vi.fn((s: unknown) => s),
  toMemoryFileInfo: vi.fn((f: unknown) => f),
  toCliHooks: vi.fn((h: unknown) => h),
}));

const mockRunCcusage = vi.hoisted(() => vi.fn())
const mockWarmUsageCache = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockInvalidateUsageCache = vi.hoisted(() => vi.fn())

vi.mock('../ccusage-runner', () => ({
  runCcusage: mockRunCcusage,
  warmUsageCache: mockWarmUsageCache,
  invalidateUsageCache: mockInvalidateUsageCache,
}));

vi.mock('../session-orchestrator', () => ({
  sessionOrchestrator: {
    onProjectSelected: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    resumeSession: vi.fn(),
    switchSession: vi.fn(),
    deleteSession: vi.fn(),
    getSessionMessages: vi.fn(),
    sendMessage: vi.fn(),
    abort: vi.fn(),
    resolvePermission: vi.fn(),
    scanProjects: vi.fn(),
  },
}));

import { registerIpcHandlers } from '../ipc-handlers';
import { sessionOrchestrator } from '../session-orchestrator';

describe('ipc-handlers', () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const mockWindow = {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { send: vi.fn() },
  } as any;

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    handle.mockImplementation((channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn);
    });

    registerIpcHandlers(() => mockWindow);
  });

  it('returns typed success payload for resumeSession IPC', async () => {
    const session: Session = {
      id: 'session-1',
      name: 'Session 1',
      projectPath: '/project',
      runtime: 'claude',
      permissionMode: 'default',
      createdAt: 1,
      updatedAt: 1,
    };
    const messages: Message[] = [
      {
        id: 'm1',
        sessionId: 'session-1',
        role: 'assistant',
        type: 'text',
        content: 'hello',
        timestamp: 2,
      },
    ];
    vi.mocked(sessionOrchestrator.resumeSession).mockResolvedValue({ session, messages });

    const resumeHandler = handlers.get(RENDERER_TO_MAIN.RESUME_SESSION);
    if (!resumeHandler) throw new Error('resume handler is not registered');

    const result = await resumeHandler({}, 'session-1');

    expect(result).toEqual({
      success: true,
      session,
      messages,
    });
  });

  it('rejects invalid sendMessage payloads', async () => {
    const sendHandler = handlers.get(RENDERER_TO_MAIN.SEND_MESSAGE);
    if (!sendHandler) throw new Error('send handler is not registered');

    await expect(sendHandler({}, 'session-1', '', 'default')).rejects.toThrow(
      'Message content is required',
    );
    expect(sessionOrchestrator.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards rememberForSession permission response to orchestrator', async () => {
    const permissionHandler = handlers.get(RENDERER_TO_MAIN.PERMISSION_RESPONSE);
    if (!permissionHandler) throw new Error('permission handler is not registered');

    await permissionHandler({}, {
      requestId: 'r1',
      allowed: false,
      reason: 'Denied',
      rememberForSession: true,
    });

    expect(sessionOrchestrator.resolvePermission).toHaveBeenCalledWith({
      requestId: 'r1',
      allowed: false,
      reason: 'Denied',
      rememberForSession: true,
    });
  });

  // ── Phase 3: Config Bridge Integration ──

  describe('env vars via config-bridge', () => {
    it('GET_ENV_VARS delegates to configReader.getResolvedSettings', async () => {
      mockConfigReader.getResolvedSettings.mockResolvedValue({ env: { API_KEY: 'sk-test' } });
      const handler = handlers.get(RENDERER_TO_MAIN.GET_ENV_VARS);
      const result = await handler!({});
      expect(result).toEqual({ API_KEY: 'sk-test' });
    });

    it('SET_ENV_VAR delegates to configWriter.setEnvVar', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.SET_ENV_VAR);
      await handler!({}, 'MY_KEY', 'my-value');
      expect(mockConfigWriter.setEnvVar).toHaveBeenCalledWith('user', 'MY_KEY', 'my-value');
    });

    it('REMOVE_ENV_VAR delegates to configWriter.removeEnvVar', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.REMOVE_ENV_VAR);
      await handler!({}, 'MY_KEY');
      expect(mockConfigWriter.removeEnvVar).toHaveBeenCalledWith('user', 'MY_KEY');
    });
  });

  describe('plugins via config-bridge', () => {
    it('GET_PLUGINS delegates to configReader.getResolvedPlugins', async () => {
      const mockPlugins = [{ id: 'p1', enabled: true }];
      mockConfigReader.getResolvedPlugins.mockResolvedValue(mockPlugins);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_PLUGINS);
      const result = await handler!({});
      expect(result).toHaveLength(1);
    });

    it('SET_PLUGIN_ENABLED delegates to configWriter.setPluginEnabled', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.SET_PLUGIN_ENABLED);
      await handler!({}, 'my-plugin', true);
      expect(mockConfigWriter.setPluginEnabled).toHaveBeenCalledWith('my-plugin', true);
    });
  });

  describe('agents via config-bridge', () => {
    it('GET_AGENTS delegates to configReader.getAllAgents', async () => {
      const mockAgents = [{ filename: 'test.md', name: 'test', scope: 'user', body: '# Agent' }];
      mockConfigReader.getAllAgents.mockResolvedValue(mockAgents);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_AGENTS);
      const result = await handler!({});
      expect(result).toHaveLength(1);
    });

    it('GET_AGENT_CONTENT returns body from whitelist match', async () => {
      const mockAgents = [{ filename: 'test.md', name: 'test', scope: 'user', body: '# Agent content' }];
      mockConfigReader.getAllAgents.mockResolvedValue(mockAgents);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_AGENT_CONTENT);
      const result = await handler!({}, 'test.md');
      expect(result).toBe('# Agent content');
    });

    it('GET_AGENT_CONTENT throws for unknown filename', async () => {
      mockConfigReader.getAllAgents.mockResolvedValue([]);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_AGENT_CONTENT);
      await expect(handler!({}, 'unknown.md')).rejects.toThrow('Agent not found');
    });
  });

  describe('mcp servers via config-bridge', () => {
    it('GET_MCP_SERVERS delegates to configReader.getMcpServers', async () => {
      const mockServers = [{ name: 'srv', command: 'npx', args: [], scope: 'user' }];
      mockConfigReader.getMcpServers.mockResolvedValue(mockServers);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_MCP_SERVERS);
      const result = await handler!({});
      expect(result).toHaveLength(1);
    });

    it('UPDATE_MCP_SERVER delegates to configWriter.upsertMcpServer', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.UPDATE_MCP_SERVER);
      await handler!({}, 'user', 'test-srv', { command: 'npx', args: ['serve'] });
      expect(mockConfigWriter.upsertMcpServer).toHaveBeenCalledWith('user', 'test-srv', {
        command: 'npx',
        args: ['serve'],
      });
    });

    it('REMOVE_MCP_SERVER delegates to configWriter.removeMcpServer', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.REMOVE_MCP_SERVER);
      await handler!({}, 'user', 'test-srv');
      expect(mockConfigWriter.removeMcpServer).toHaveBeenCalledWith('user', 'test-srv');
    });
  });

  describe('hooks via config-bridge', () => {
    it('GET_CLI_HOOKS delegates to configReader.getEffectiveHooks', async () => {
      const mockHooks = { PreToolUse: [{ matcher: '*', hooks: [] }] };
      mockConfigReader.getEffectiveHooks.mockResolvedValue(mockHooks);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_CLI_HOOKS);
      await handler!({});
      expect(mockConfigReader.getEffectiveHooks).toHaveBeenCalled();
    });

    it('UPDATE_CLI_HOOKS delegates to configWriter.writeSettingsKey', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.UPDATE_CLI_HOOKS);
      const hookData = { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command' as const, command: 'echo hi' }] }] };
      await handler!({}, hookData);
      expect(mockConfigWriter.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', hookData);
    });
  });

  describe('usage stats via ccusage-runner', () => {
    it('GET_USAGE_STATS delegates to runCcusage with validated command', async () => {
      const mockData = [{ date: '2026-02-27', totalTokens: 1000, totalCost: 0.05 }];
      mockRunCcusage.mockResolvedValue(mockData);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_USAGE_STATS);
      const result = await handler!({}, 'daily');
      expect(mockRunCcusage).toHaveBeenCalledWith('daily');
      expect(result).toEqual(mockData);
    });

    it('GET_USAGE_STATS rejects invalid command', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.GET_USAGE_STATS);
      await expect(handler!({}, 'invalid')).rejects.toThrow();
    });
  });

  describe('memory via config-bridge', () => {
    it('GET_MEMORY_FILES delegates to configReader.getClaudeMdFiles', async () => {
      const mockFiles = [{ filePath: '/home/.claude/CLAUDE.md', name: 'CLAUDE.md', scope: 'user-global', content: '# Mem' }];
      mockConfigReader.getClaudeMdFiles.mockResolvedValue(mockFiles);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_MEMORY_FILES);
      const result = await handler!({});
      expect(result).toHaveLength(1);
    });

    it('GET_MEMORY_CONTENT returns content from whitelist match', async () => {
      const mockFiles = [{ filePath: '/home/.claude/CLAUDE.md', name: 'CLAUDE.md', scope: 'user-global', content: '# Memory' }];
      mockConfigReader.getClaudeMdFiles.mockResolvedValue(mockFiles);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_MEMORY_CONTENT);
      const result = await handler!({}, '/home/.claude/CLAUDE.md');
      expect(result).toBe('# Memory');
    });

    it('GET_MEMORY_CONTENT throws for unknown path', async () => {
      mockConfigReader.getClaudeMdFiles.mockResolvedValue([]);
      const handler = handlers.get(RENDERER_TO_MAIN.GET_MEMORY_CONTENT);
      await expect(handler!({}, '/nonexistent')).rejects.toThrow('Memory file not found');
    });

    it('UPDATE_MEMORY_CONTENT delegates to configWriter.writeMemoryContent', async () => {
      const handler = handlers.get(RENDERER_TO_MAIN.UPDATE_MEMORY_CONTENT);
      await handler!({}, '/home/.claude/CLAUDE.md', 'new content');
      expect(mockConfigWriter.writeMemoryContent).toHaveBeenCalledWith('/home/.claude/CLAUDE.md', 'new content');
    });
  });
});
