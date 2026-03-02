import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HooksWriter } from './hooks.writer.js'

vi.mock('../parsers/settings.parser.js', () => ({
  parseSettingsFile: vi.fn(),
}))
vi.mock('../constants/paths.js', () => ({
  globalSettingsPath: vi.fn((home: string) => `${home}/settings.json`),
  projectSettingsPath: vi.fn((p: string) => `${p}/.claude/settings.json`),
  localSettingsPath: vi.fn((_h: string, enc: string) => `/home/.claude/projects/${enc}/settings.json`),
}))

const { parseSettingsFile } = await import('../parsers/settings.parser.js')
const mockParse = vi.mocked(parseSettingsFile)

function makeSettingsWriter(claudeHome = '/home/.claude', projectPath?: string) {
  const writeSettingsKey = vi.fn().mockResolvedValue(undefined)
  const writer = { claudeHome, projectPath, writeSettingsKey }
  return writer as unknown as import('./settings.writer.js').SettingsWriter
}

beforeEach(() => vi.clearAllMocks())

describe('HooksWriter', () => {
  describe('addHookRule', () => {
    it('adds a rule to an empty hooks map', async () => {
      mockParse.mockResolvedValue(null)
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)
      const rule = { matcher: 'always', hooks: [{ type: 'command' as const, command: 'echo hi' }] }

      await hw.addHookRule('user', 'PreToolUse', rule)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', {
        PreToolUse: [rule],
      })
    })

    it('appends a rule to an existing event type', async () => {
      const existing = { matcher: 'old', hooks: [{ type: 'command' as const, command: 'old' }] }
      mockParse.mockResolvedValue({ hooks: { PreToolUse: [existing] } })
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)
      const newRule = { matcher: 'new', hooks: [{ type: 'command' as const, command: 'new' }] }

      await hw.addHookRule('user', 'PreToolUse', newRule)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', {
        PreToolUse: [existing, newRule],
      })
    })
  })

  describe('removeHookRule', () => {
    it('removes a rule at the given index', async () => {
      const r0 = { matcher: 'a', hooks: [{ type: 'command' as const, command: 'a' }] }
      const r1 = { matcher: 'b', hooks: [{ type: 'command' as const, command: 'b' }] }
      mockParse.mockResolvedValue({ hooks: { PreToolUse: [r0, r1] } })
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)

      await hw.removeHookRule('user', 'PreToolUse', 0)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', {
        PreToolUse: [r1],
      })
    })

    it('removes the event type key when last rule is removed', async () => {
      const r0 = { matcher: 'a', hooks: [{ type: 'command' as const, command: 'a' }] }
      mockParse.mockResolvedValue({ hooks: { PreToolUse: [r0] } })
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)

      await hw.removeHookRule('user', 'PreToolUse', 0)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', {})
    })

    it('does nothing for out-of-range index', async () => {
      mockParse.mockResolvedValue(null)
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)

      await hw.removeHookRule('user', 'PreToolUse', 5)

      expect(sw.writeSettingsKey).not.toHaveBeenCalled()
    })
  })

  describe('updateHookRule', () => {
    it('updates a rule at the given index', async () => {
      const r0 = { matcher: 'old', hooks: [{ type: 'command' as const, command: 'old' }] }
      mockParse.mockResolvedValue({ hooks: { PreToolUse: [r0] } })
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)
      const updated = { matcher: 'new', hooks: [{ type: 'command' as const, command: 'new' }] }

      await hw.updateHookRule('user', 'PreToolUse', 0, updated)

      expect(sw.writeSettingsKey).toHaveBeenCalledWith('user', 'hooks', {
        PreToolUse: [updated],
      })
    })

    it('does nothing for out-of-range index', async () => {
      mockParse.mockResolvedValue(null)
      const sw = makeSettingsWriter()
      const hw = new HooksWriter(sw)

      await hw.updateHookRule('user', 'PreToolUse', 99, { matcher: 'x', hooks: [] })

      expect(sw.writeSettingsKey).not.toHaveBeenCalled()
    })
  })
})
