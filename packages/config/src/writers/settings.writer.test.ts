import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsWriter } from './settings.writer.js'

vi.mock('../utils/file-io.js', () => ({
  safeReadJson: vi.fn(),
  atomicWriteJson: vi.fn(),
}))

const { safeReadJson, atomicWriteJson } = await import('../utils/file-io.js')
const mockSafeReadJson = vi.mocked(safeReadJson)
const mockAtomicWriteJson = vi.mocked(atomicWriteJson)

beforeEach(() => {
  vi.clearAllMocks()
  mockAtomicWriteJson.mockResolvedValue(undefined)
})

describe('SettingsWriter', () => {
  const writer = new SettingsWriter({
    claudeHome: '/home/user/.claude',
    projectPath: '/home/user/project',
  })

  describe('writeSettingsKey', () => {
    it('writes a key while preserving others', async () => {
      mockSafeReadJson.mockResolvedValue({ existing: 'value', language: 'English' })

      await writer.writeSettingsKey('user', 'language', 'Chinese')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        { existing: 'value', language: 'Chinese' },
      )
    })

    it('creates new file when none exists', async () => {
      mockSafeReadJson.mockResolvedValue(null)

      await writer.writeSettingsKey('user', 'model', 'opus')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        { model: 'opus' },
      )
    })

    it('serializes concurrent writes', async () => {
      const order: number[] = []
      mockSafeReadJson.mockImplementation(async () => {
        // Simulate slow read
        await new Promise((r) => setTimeout(r, 10))
        return {}
      })
      mockAtomicWriteJson.mockImplementation(async (_path, data) => {
        const d = data as Record<string, unknown>
        if (d['key'] === 'first') order.push(1)
        if (d['key'] === 'second') order.push(2)
      })

      // Launch two writes concurrently
      const p1 = writer.writeSettingsKey('user', 'key', 'first')
      const p2 = writer.writeSettingsKey('user', 'key', 'second')
      await Promise.all([p1, p2])

      expect(order).toEqual([1, 2])
    })
  })

  describe('setEnvVar', () => {
    it('adds env var to existing env', async () => {
      mockSafeReadJson.mockResolvedValue({ env: { EXISTING: 'val' } })

      await writer.setEnvVar('user', 'NEW_VAR', 'new_val')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: { EXISTING: 'val', NEW_VAR: 'new_val' },
        }),
      )
    })

    it('creates env key when it does not exist', async () => {
      mockSafeReadJson.mockResolvedValue({})

      await writer.setEnvVar('user', 'KEY', 'value')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: { KEY: 'value' },
        }),
      )
    })
  })

  describe('removeEnvVar', () => {
    it('removes an env var', async () => {
      mockSafeReadJson.mockResolvedValue({ env: { A: '1', B: '2' } })

      await writer.removeEnvVar('user', 'A')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: { B: '2' },
        }),
      )
    })

    it('does nothing when env key is missing', async () => {
      mockSafeReadJson.mockResolvedValue({})

      await writer.removeEnvVar('user', 'MISSING')

      expect(mockAtomicWriteJson).not.toHaveBeenCalled()
    })
  })

  describe('removeSettingsKey', () => {
    it('removes a top-level key', async () => {
      mockSafeReadJson.mockResolvedValue({ a: 1, b: 2 })

      await writer.removeSettingsKey('user', 'a')

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        { b: 2 },
      )
    })
  })

  describe('scope routing', () => {
    it('throws for project scope without projectPath', () => {
      const noProject = new SettingsWriter({ claudeHome: '/home/.claude' })
      expect(() =>
        noProject.writeSettingsKey('project', 'key', 'val'),
      ).toThrow('projectPath is required')
    })

    it('throws for local scope without projectPath', () => {
      const noProject = new SettingsWriter({ claudeHome: '/home/.claude' })
      expect(() =>
        noProject.writeSettingsKey('local', 'key', 'val'),
      ).toThrow('projectPath is required')
    })

    it('routes user scope to global settings path', async () => {
      mockSafeReadJson.mockResolvedValue({})
      await writer.writeSettingsKey('user', 'k', 'v')
      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('.claude'),
        expect.any(Object),
      )
    })
  })
})
