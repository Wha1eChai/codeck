import { ipcMain } from 'electron';
import { z } from 'zod';
import { RENDERER_TO_MAIN } from '@common/ipc-channels';
import {
  toPluginInfo,
  toAgentInfo,
  toMcpServerInfo,
  toMemoryFileInfo,
  toCliHooks,
} from '@codeck/config';
import { configReader, getConfigWriter, getProjectPath } from '../config-bridge';
import { runCcusage } from '../ccusage-runner';

export function registerConfigHandlers() {
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

  // ── Plugins ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_PLUGINS, async () => {
    const plugins = await configReader.getResolvedPlugins(getProjectPath());
    return plugins.map(toPluginInfo);
  });

  ipcMain.handle(RENDERER_TO_MAIN.SET_PLUGIN_ENABLED, async (_, pluginId: unknown, enabled: unknown) => {
    const validId = z.string().min(1).parse(pluginId);
    const validEnabled = z.boolean().parse(enabled);
    await getConfigWriter().setPluginEnabled(validId, validEnabled);
  });

  // ── Agents & Skills ──

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

  // ── MCP Servers ──

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

  // ── CLI Hooks ──

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

  // ── Usage stats (ccusage) ──

  ipcMain.handle(RENDERER_TO_MAIN.GET_USAGE_STATS, async (_, command: unknown) => {
    const validated = z.enum(['daily', 'monthly', 'session']).parse(command);
    return runCcusage(validated);
  });

  // ── Memory ──

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
}
