import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeFilesService } from '../claude-files'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('../config-bridge', () => ({
  configReader: {},
  getConfigWriter: () => ({}),
  getProjectPath: () => undefined,
}))

describe('ClaudeFilesService', () => {
  let service: ClaudeFilesService
  const mockHomedir = path.resolve('C:', 'mock-claude-home')

  beforeEach(() => {
    service = new ClaudeFilesService()
    vi.mocked(os.homedir).mockReturnValue(mockHomedir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listSessions', () => {
    it('should return empty array when sessions directory does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))

      const sessions = await service.listSessions('/project/path')

      expect(sessions).toEqual([])
    })

    it('should parse JSONL files and extract session names from first user message', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['session-1.jsonl'] as any)
      vi.mocked(fs.stat).mockResolvedValue({
        birthtimeMs: 1000,
        mtimeMs: 2000,
      } as any)

      const jsonlContent = [
        '{"type": "user", "content": "Help me refactor the auth module"}',
        '{"type": "assistant", "content": "Sure, let me look at it..."}',
      ].join('\n')
      vi.mocked(fs.readFile).mockResolvedValue(jsonlContent)

      const sessions = await service.listSessions('/project/path')

      expect(sessions).toHaveLength(1)
      expect(sessions[0].name).toBe('Help me refactor the auth module')
      expect(sessions[0].id).toBe('session-1')
      expect(sessions[0].runtime).toBe('claude')
    })

    it('should truncate long session names', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['session-2.jsonl'] as any)
      vi.mocked(fs.stat).mockResolvedValue({
        birthtimeMs: 1000,
        mtimeMs: 2000,
      } as any)

      const longMessage = 'A'.repeat(100)
      const jsonlContent = `{"type": "user", "content": "${longMessage}"}`
      vi.mocked(fs.readFile).mockResolvedValue(jsonlContent)

      const sessions = await service.listSessions('/project/path')

      expect(sessions[0].name).toBe('A'.repeat(50) + '...')
    })

    it('should fall back to placeholder name when no user message found', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['abc123.jsonl'] as any)
      vi.mocked(fs.stat).mockResolvedValue({
        birthtimeMs: 1000,
        mtimeMs: 2000,
      } as any)
      vi.mocked(fs.readFile).mockResolvedValue('{"type": "assistant", "content": "hello"}')

      const sessions = await service.listSessions('/project/path')

      expect(sessions[0].name).toBe('Session abc123')
    })

    it('should sort sessions by updatedAt descending', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['old.jsonl', 'new.jsonl'] as any)
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ birthtimeMs: 1000, mtimeMs: 1000 } as any)
        .mockResolvedValueOnce({ birthtimeMs: 2000, mtimeMs: 3000 } as any)
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('{"type": "user", "content": "old"}')
        .mockResolvedValueOnce('{"type": "user", "content": "new"}')

      const sessions = await service.listSessions('/project/path')

      expect(sessions[0].name).toBe('new')
      expect(sessions[1].name).toBe('old')
    })

    it('should parse runtime and permission mode from session_meta header', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['session-3.jsonl'] as any)
      vi.mocked(fs.stat).mockResolvedValue({
        birthtimeMs: 1000,
        mtimeMs: 2000,
      } as any)
      vi.mocked(fs.readFile).mockResolvedValue(
        '{"type":"session_meta","name":"Build Runtime Layer","runtime":"codex","permission_mode":"plan"}\n',
      )

      const sessions = await service.listSessions('/project/path')

      expect(sessions).toHaveLength(1)
      expect(sessions[0].name).toBe('Build Runtime Layer')
      expect(sessions[0].runtime).toBe('codex')
      expect(sessions[0].permissionMode).toBe('plan')
    })

    it('should extract session name from native user message blocks', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readdir).mockResolvedValue(['native-1.jsonl'] as any)
      vi.mocked(fs.stat).mockResolvedValue({
        birthtimeMs: 1000,
        mtimeMs: 2000,
      } as any)
      vi.mocked(fs.readFile).mockResolvedValue(
        '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Native hello title"}]}}\n',
      )

      const sessions = await service.listSessions('/project/path')

      expect(sessions).toHaveLength(1)
      expect(sessions[0].name).toBe('Native hello title')
    })
  })

  describe('getSessionMessages', () => {
    // Use a valid UUID-like session ID that won't trigger path traversal
    const validSessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('should return empty array when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      )

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toEqual([])
    })

    it('should parse user messages', async () => {
      const jsonl = '{"type": "user", "content": "hello", "timestamp": 1000}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].type).toBe('text')
      expect(messages[0].content).toBe('hello')
    })

    it('should parse assistant messages', async () => {
      const jsonl = '{"type": "assistant", "content": "world", "timestamp": 1000}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('assistant')
    })

    it('should parse thinking messages', async () => {
      const jsonl = '{"type": "thinking", "content": "let me think", "timestamp": 1000}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('thinking')
    })

    it('should parse tool_use messages', async () => {
      const jsonl = '{"type": "tool_use", "tool_name": "Read", "tool_input": {"file_path": "/a.ts"}, "timestamp": 1000}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('tool_use')
      expect(messages[0].toolName).toBe('Read')
    })

    it('should parse usage messages', async () => {
      const jsonl = '{"type": "usage", "input_tokens": 100, "output_tokens": 50, "timestamp": 1000}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('usage')
      expect(messages[0].usage?.inputTokens).toBe(100)
      expect(messages[0].usage?.outputTokens).toBe(50)
    })

    it('should salvage unknown message types as text when content exists', async () => {
      const jsonl = '{"type": "unknown_type", "content": "skip me"}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('text')
      expect(messages[0].content).toBe('skip me')
    })

    it('should skip malformed JSON lines gracefully', async () => {
      const jsonl = 'not-json\n{"type": "user", "content": "valid"}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe('valid')
    })

    it('should parse native assistant blocks into multiple messages', async () => {
      const jsonl = '{"type":"assistant","uuid":"u1","timestamp":"2026-01-01T00:00:00.000Z","message":{"id":"m1","role":"assistant","usage":{"input_tokens":10,"output_tokens":2},"content":[{"type":"thinking","thinking":"hmm"},{"type":"text","text":"done"}]}}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(2)
      expect(messages[0].type).toBe('thinking')
      expect(messages[1].type).toBe('text')
      expect(messages[1].usage?.inputTokens).toBe(10)
    })

    it('should parse native user tool_result rows', async () => {
      const jsonl = '{"type":"user","uuid":"u2","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"stdout","is_error":false}]}}\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('tool_result')
      expect(messages[0].toolUseId).toBe('toolu_1')
      expect(messages[0].success).toBe(true)
    })

    it('should preserve sdk parser context across history lines', async () => {
      const jsonl = [
        '{"type":"assistant","uuid":"a1","timestamp":1000,"message":{"id":"m1","content":[{"type":"tool_use","id":"toolu_ctx_1","name":"Read","input":{"file_path":"/a.ts"}}]}}',
        '{"type":"user","uuid":"u1","timestamp":1100,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_ctx_1","content":"done","is_error":false}]}}',
      ].join('\n') + '\n'
      vi.mocked(fs.readFile).mockResolvedValue(jsonl)

      const messages = await service.getSessionMessages('/project/path', validSessionId)

      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'toolu_ctx_1',
        timestamp: 1000,
      })
      expect(messages[1]).toMatchObject({
        type: 'tool_result',
        toolName: 'Read',
        toolUseId: 'toolu_ctx_1',
        timestamp: 1100,
      })
    })

    it('should reject path traversal attempts', async () => {
      await expect(
        service.getSessionMessages('/project/path', '../../../etc/passwd'),
      ).rejects.toThrow('path traversal')
    })
  })

  describe('createSession', () => {
    it('should create a session with a UUID and current timestamp', async () => {
      const session = await service.createSession({
        name: 'Test Session',
        projectPath: '/project/path',
        permissionMode: 'default',
      })

      expect(session.name).toBe('Test Session')
      expect(session.projectPath).toBe('/project/path')
      expect(session.runtime).toBe('claude')
      expect(session.permissionMode).toBe('default')
      expect(session.id).toBeTruthy()
      expect(session.createdAt).toBeGreaterThan(0)
      expect(session.updatedAt).toBe(session.createdAt)
    })

    it('should keep provided runtime when creating a session', async () => {
      const session = await service.createSession({
        name: 'Runtime Session',
        projectPath: '/project/path',
        runtime: 'opencode',
        permissionMode: 'default',
      })

      expect(session.runtime).toBe('opencode')
    })
  })

  describe('project metadata', () => {
    it('should merge project metadata under namespaced key without overwriting existing settings', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          someClaudeSetting: { enabled: true },
          project_path: '/legacy/path',
        }),
      )
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await service.saveProjectMetadata('/new/project/path')

      expect(fs.writeFile).toHaveBeenCalledTimes(2)
      for (const [, raw] of vi.mocked(fs.writeFile).mock.calls) {
        const written = JSON.parse(raw as string)
        expect(written.someClaudeSetting).toEqual({ enabled: true })
        expect(written.project_path).toBe('/legacy/path')
        expect(written.ccuiProjectMeta.project_path).toBe('/new/project/path')
        expect(written.ccuiProjectMeta.accessed_by).toBe('codeck')
      }
    })

    it('should resolve project path from namespaced metadata first', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          project_path: '/legacy/path',
          ccuiProjectMeta: { project_path: '/namespaced/path' },
        }),
      )

      const resolved = await service.resolveProjectPath('abc123def456')

      expect(resolved).toBe('/namespaced/path')
    })
  })

  describe('deleteSession', () => {
    const validSessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('should delete the session file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      await service.deleteSession('/project/path', validSessionId)

      expect(fs.unlink).toHaveBeenCalledOnce()
      const calledPath = vi.mocked(fs.unlink).mock.calls[0][0] as string
      expect(calledPath).toContain(validSessionId)
    })

    it('should not throw when file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      )

      await expect(
        service.deleteSession('/project/path', validSessionId),
      ).resolves.not.toThrow()
    })

    it('should throw on other errors', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      )

      await expect(
        service.deleteSession('/project/path', validSessionId),
      ).rejects.toThrow('EPERM')
    })
  })

  describe('appendSessionRuntime', () => {
    const validSessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    it('should append runtime marker with sdk_session_id', async () => {
      vi.mocked(fs.appendFile).mockResolvedValue(undefined)

      await service.appendSessionRuntime('/project/path', validSessionId, 'sdk-session-xyz')

      expect(fs.appendFile).toHaveBeenCalledOnce()
      const [, data] = vi.mocked(fs.appendFile).mock.calls[0] as [string, string, string]
      const parsed = JSON.parse((data as string).trim())
      expect(parsed).toMatchObject({
        type: 'session_runtime',
        session_id: validSessionId,
        sdk_session_id: 'sdk-session-xyz',
      })
    })

    it('should append kernel runtime metadata for canonical transcripts', async () => {
      vi.mocked(fs.appendFile).mockResolvedValue(undefined)

      await service.appendSessionRuntime('/project/path', validSessionId, {
        runtime: 'kernel',
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'plan',
      })

      const [, data] = vi.mocked(fs.appendFile).mock.calls[0] as [string, string, string]
      const parsed = JSON.parse((data as string).trim())
      expect(parsed).toMatchObject({
        type: 'session_runtime',
        session_id: validSessionId,
        runtime_provider: 'kernel',
        model: 'claude-sonnet-4-20250514',
        permission_mode: 'plan',
      })
    })
  })
})
