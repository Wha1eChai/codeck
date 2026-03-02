import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { safeReadFile, safeReadJson, safeListDir, pathExists, atomicWriteJson } from './file-io.js'

vi.mock('node:fs/promises')

const mockFs = vi.mocked(fs)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('safeReadFile', () => {
  it('returns file content on success', async () => {
    mockFs.readFile.mockResolvedValue('hello world')
    const result = await safeReadFile('/test/file.txt')
    expect(result).toBe('hello world')
  })

  it('returns null on file not found', async () => {
    mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
    const result = await safeReadFile('/nonexistent')
    expect(result).toBeNull()
  })
})

describe('safeReadJson', () => {
  it('parses valid JSON', async () => {
    mockFs.readFile.mockResolvedValue('{"key": "value"}')
    const result = await safeReadJson('/test.json')
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for invalid JSON', async () => {
    mockFs.readFile.mockResolvedValue('not json')
    const result = await safeReadJson('/test.json')
    expect(result).toBeNull()
  })

  it('returns null when file does not exist', async () => {
    mockFs.readFile.mockRejectedValue(new Error('ENOENT'))
    const result = await safeReadJson('/missing.json')
    expect(result).toBeNull()
  })
})

describe('safeListDir', () => {
  it('returns directory entries', async () => {
    mockFs.readdir.mockResolvedValue(['a.ts', 'b.ts'] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
    const result = await safeListDir('/src')
    expect(result).toEqual(['a.ts', 'b.ts'])
  })

  it('returns empty array when directory does not exist', async () => {
    mockFs.readdir.mockRejectedValue(new Error('ENOENT'))
    const result = await safeListDir('/missing')
    expect(result).toEqual([])
  })
})

describe('pathExists', () => {
  it('returns true when file exists', async () => {
    mockFs.access.mockResolvedValue(undefined)
    expect(await pathExists('/exists')).toBe(true)
  })

  it('returns false when file does not exist', async () => {
    mockFs.access.mockRejectedValue(new Error('ENOENT'))
    expect(await pathExists('/missing')).toBe(false)
  })
})

describe('atomicWriteJson', () => {
  it('writes JSON via atomic rename', async () => {
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)
    mockFs.rename.mockResolvedValue(undefined)

    await atomicWriteJson('/test/output.json', { hello: 'world' })

    expect(mockFs.mkdir).toHaveBeenCalledWith('/test', { recursive: true })
    expect(mockFs.writeFile).toHaveBeenCalledOnce()
    expect(mockFs.rename).toHaveBeenCalledOnce()
  })

  it('falls back to direct write if rename fails', async () => {
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)
    mockFs.rename.mockRejectedValue(new Error('cross-device'))
    mockFs.unlink.mockResolvedValue(undefined)

    await atomicWriteJson('/test/output.json', { hello: 'world' })

    // writeFile called twice: once for tmp, once for fallback
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
  })
})
