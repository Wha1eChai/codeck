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
import { createHandler, createValidatedHandler, createMultiArgHandler } from './create-handler';

// ── Inline schemas for multi-arg handlers ──

const setEnvVarSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

const setPluginEnabledSchema = z.object({
  pluginId: z.string().min(1),
  enabled: z.boolean(),
});

const updateMcpServerSchema = z.object({
  scope: z.enum(['user', 'project']),
  name: z.string().min(1),
  config: z.object({
    command: z.string().min(1),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
  }),
});

const removeMcpServerSchema = z.object({
  scope: z.enum(['user', 'project']),
  name: z.string().min(1),
});

const updateCliHooksSchema = z.record(z.string(), z.array(z.object({
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
})));

const updateMemoryContentSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
});

export function registerConfigHandlers() {
  // ── CLI Config (env) ──

  createHandler(RENDERER_TO_MAIN.GET_ENV_VARS, {
    handle: async () => {
      const resolved = await configReader.getResolvedSettings(getProjectPath());
      return resolved.env ?? {};
    },
  });

  createMultiArgHandler(RENDERER_TO_MAIN.SET_ENV_VAR, {
    schema: setEnvVarSchema,
    mapArgs: (name, value) => ({ name, value }),
    handle: (v) => getConfigWriter().setEnvVar('user', v.name, v.value),
  });

  createValidatedHandler(RENDERER_TO_MAIN.REMOVE_ENV_VAR, {
    schema: z.string().min(1),
    handle: (name) => getConfigWriter().removeEnvVar('user', name),
  });

  // ── Plugins ──

  createHandler(RENDERER_TO_MAIN.GET_PLUGINS, {
    handle: async () => {
      const plugins = await configReader.getResolvedPlugins(getProjectPath());
      return plugins.map(toPluginInfo);
    },
  });

  createMultiArgHandler(RENDERER_TO_MAIN.SET_PLUGIN_ENABLED, {
    schema: setPluginEnabledSchema,
    mapArgs: (pluginId, enabled) => ({ pluginId, enabled }),
    handle: (v) => getConfigWriter().setPluginEnabled(v.pluginId, v.enabled),
  });

  // ── Agents & Skills ──

  createHandler(RENDERER_TO_MAIN.GET_AGENTS, {
    handle: async () => {
      const agents = await configReader.getAllAgents(getProjectPath());
      return agents.map(toAgentInfo);
    },
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_AGENT_CONTENT, {
    schema: z.string().min(1),
    handle: async (filename) => {
      const agents = await configReader.getAllAgents(getProjectPath());
      const match = agents.find((a) => a.filename === filename);
      if (!match) throw new Error(`Agent not found: ${filename}`);
      return match.body;
    },
  });

  // ── MCP Servers ──

  createHandler(RENDERER_TO_MAIN.GET_MCP_SERVERS, {
    handle: async () => {
      const servers = await configReader.getMcpServers(getProjectPath());
      return servers.map(toMcpServerInfo);
    },
  });

  createMultiArgHandler(RENDERER_TO_MAIN.UPDATE_MCP_SERVER, {
    schema: updateMcpServerSchema,
    mapArgs: (scope, name, config) => ({ scope, name, config }),
    handle: (v) => getConfigWriter().upsertMcpServer(v.scope, v.name, {
      command: v.config.command,
      args: v.config.args,
      env: v.config.env,
    }),
  });

  createMultiArgHandler(RENDERER_TO_MAIN.REMOVE_MCP_SERVER, {
    schema: removeMcpServerSchema,
    mapArgs: (scope, name) => ({ scope, name }),
    handle: (v) => getConfigWriter().removeMcpServer(v.scope, v.name),
  });

  // ── CLI Hooks ──

  createHandler(RENDERER_TO_MAIN.GET_CLI_HOOKS, {
    handle: async () => {
      const resolved = await configReader.getEffectiveHooks(getProjectPath());
      return toCliHooks(resolved);
    },
  });

  createValidatedHandler(RENDERER_TO_MAIN.UPDATE_CLI_HOOKS, {
    schema: updateCliHooksSchema,
    handle: (validated) => getConfigWriter().writeSettingsKey('user', 'hooks', validated),
  });

  // ── Usage stats (ccusage) ──

  createValidatedHandler(RENDERER_TO_MAIN.GET_USAGE_STATS, {
    schema: z.enum(['daily', 'monthly', 'session']),
    handle: (command) => runCcusage(command),
  });

  // ── Memory ──

  createHandler(RENDERER_TO_MAIN.GET_MEMORY_FILES, {
    handle: async () => {
      const files = await configReader.getClaudeMdFiles(getProjectPath());
      return files.map(toMemoryFileInfo);
    },
  });

  createValidatedHandler(RENDERER_TO_MAIN.GET_MEMORY_CONTENT, {
    schema: z.string().min(1),
    handle: async (filePath) => {
      const files = await configReader.getClaudeMdFiles(getProjectPath());
      const match = files.find((f) => f.filePath === filePath);
      if (!match) throw new Error(`Memory file not found: ${filePath}`);
      return match.content;
    },
  });

  createMultiArgHandler(RENDERER_TO_MAIN.UPDATE_MEMORY_CONTENT, {
    schema: updateMemoryContentSchema,
    mapArgs: (filePath, content) => ({ filePath, content }),
    handle: (v) => getConfigWriter().writeMemoryContent(v.filePath, v.content),
  });
}
