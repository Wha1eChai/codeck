import { describe, it, expect } from 'vitest'
import {
  toPluginInfo,
  toAgentInfo,
  toSkillInfo,
  toMcpServerInfo,
  toMemoryFileInfo,
  toCliHooks,
} from './mappers.js'
import type { ResolvedPlugin } from '../resolvers/plugins.resolver.js'
import type { AgentFile } from '../schemas/agent.schema.js'
import type { SkillFile } from '../schemas/skill.schema.js'
import type { McpServerEntry } from '../schemas/mcp-server.schema.js'
import type { ClaudeMdFile } from '../schemas/claude-md.schema.js'
import type { ResolvedHooksMap } from '../resolvers/hooks.resolver.js'

describe('toPluginInfo', () => {
  it('maps ResolvedPlugin to flat PluginInfo', () => {
    const plugin: ResolvedPlugin = {
      id: 'my-plugin@marketplace',
      name: 'my-plugin',
      marketplace: 'marketplace',
      installPath: '/path',
      version: '1.0.0',
      installedAt: '2025-01-01',
      lastUpdated: '2025-06-01',
      enabled: true,
      blocked: false,
      manifest: null,
      scope: 'user',
    }
    const info = toPluginInfo(plugin)
    expect(info.id).toBe('my-plugin@marketplace')
    expect(info.version).toBe('1.0.0')
    expect(info.enabled).toBe(true)
    expect(info.installedAt).toBe('2025-01-01')
    expect(info.lastUpdated).toBe('2025-06-01')
  })
})

describe('toAgentInfo', () => {
  it('maps global scope to user', () => {
    const agent: AgentFile = {
      filename: 'planner.md',
      filePath: '/agents/planner.md',
      scope: 'global',
      pluginId: undefined,
      name: 'Planner',
      frontmatter: { description: 'Plans things' },
      body: '# content',
    }
    const info = toAgentInfo(agent)
    expect(info.scope).toBe('user')
    expect(info.description).toBe('Plans things')
    expect(info.filename).toBe('planner.md')
  })

  it('maps project scope unchanged', () => {
    const agent: AgentFile = {
      filename: 'reviewer.md',
      filePath: '/project/.claude/agents/reviewer.md',
      scope: 'project',
      pluginId: undefined,
      name: 'Reviewer',
      frontmatter: {},
      body: '',
    }
    const info = toAgentInfo(agent)
    expect(info.scope).toBe('project')
    expect(info.description).toBeUndefined()
  })
})

describe('toSkillInfo', () => {
  it('maps global skill', () => {
    const skill: SkillFile = {
      name: 'commit',
      dirPath: '/skills/commit',
      scope: 'global',
      pluginId: undefined,
      frontmatter: {},
      body: '',
    }
    const info = toSkillInfo(skill)
    expect(info.name).toBe('commit')
    expect(info.source).toBe('user')
  })

  it('maps plugin skill with pluginId', () => {
    const skill: SkillFile = {
      name: 'deploy',
      dirPath: '/plugins/deploy',
      scope: 'plugin',
      pluginId: 'vercel@official',
      frontmatter: {},
      body: '',
    }
    const info = toSkillInfo(skill)
    expect(info.source).toBe('vercel@official')
  })
})

describe('toMcpServerInfo', () => {
  it('maps user scope server', () => {
    const entry: McpServerEntry = {
      name: 'my-server',
      config: { command: 'node', args: ['serve.js'] },
      scope: 'user',
      source: 'settings',
    }
    const info = toMcpServerInfo(entry)
    expect(info.name).toBe('my-server')
    expect(info.command).toBe('node')
    expect(info.args).toEqual(['serve.js'])
    expect(info.scope).toBe('user')
  })

  it('maps local scope to user', () => {
    const entry: McpServerEntry = {
      name: 'local-server',
      config: { command: 'python' },
      scope: 'local',
      source: 'settings',
    }
    const info = toMcpServerInfo(entry)
    expect(info.scope).toBe('user')
  })

  it('handles url-based server with no command', () => {
    const entry: McpServerEntry = {
      name: 'sse',
      config: { url: 'http://localhost:8080' },
      scope: 'project',
      source: '.mcp.json',
    }
    const info = toMcpServerInfo(entry)
    expect(info.command).toBe('')
    expect(info.args).toEqual([])
    expect(info.scope).toBe('project')
  })
})

describe('toMemoryFileInfo', () => {
  it('maps user-global scope', () => {
    const file: ClaudeMdFile = {
      filePath: '/home/.claude/CLAUDE.md',
      scope: 'user-global',
      projectPath: undefined,
      name: undefined,
      content: '# Global',
    }
    const info = toMemoryFileInfo(file)
    expect(info.scope).toBe('user-global')
    expect(info.name).toBe('CLAUDE.md')
  })

  it('maps project-root and project-claude-dir to project', () => {
    const root: ClaudeMdFile = {
      filePath: '/project/CLAUDE.md',
      scope: 'project-root',
      projectPath: '/project',
      name: undefined,
      content: '',
    }
    expect(toMemoryFileInfo(root).scope).toBe('project')

    const claudeDir: ClaudeMdFile = {
      filePath: '/project/.claude/CLAUDE.md',
      scope: 'project-claude-dir',
      projectPath: '/project',
      name: undefined,
      content: '',
    }
    expect(toMemoryFileInfo(claudeDir).scope).toBe('project')
  })

  it('maps memory scope to project-memory', () => {
    const mem: ClaudeMdFile = {
      filePath: '/home/.claude/projects/enc/memory/MEMORY.md',
      scope: 'memory',
      projectPath: '/project',
      content: '# Notes',
      name: 'MEMORY.md',
    }
    const info = toMemoryFileInfo(mem)
    expect(info.scope).toBe('project-memory')
    expect(info.name).toBe('MEMORY.md')
  })
})

describe('toCliHooks', () => {
  it('maps resolved hooks to flat CLI format', () => {
    const resolved: ResolvedHooksMap = {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: 'echo hi', source: 'settings' },
          ],
          source: 'settings',
        },
      ],
    }
    const hooks = toCliHooks(resolved)
    expect(Object.keys(hooks)).toEqual(['PreToolUse'])
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PreToolUse![0]!.matcher).toBe('Bash')
    expect(hooks.PreToolUse![0]!.hooks[0]!.command).toBe('echo hi')
  })
})
