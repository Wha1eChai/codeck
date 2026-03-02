import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeMemoryContent } from './memory.writer.js'

vi.mock('../utils/file-io.js', () => ({
  atomicWriteText: vi.fn().mockResolvedValue(undefined),
}))

const { atomicWriteText } = await import('../utils/file-io.js')
const mockWrite = vi.mocked(atomicWriteText)

beforeEach(() => vi.clearAllMocks())

describe('writeMemoryContent', () => {
  it('writes content to the given path via atomicWriteText', async () => {
    await writeMemoryContent('/home/.claude/memory/MEMORY.md', '# Notes')
    expect(mockWrite).toHaveBeenCalledWith('/home/.claude/memory/MEMORY.md', '# Notes')
  })

  it('writes empty string', async () => {
    await writeMemoryContent('/path/to/file.md', '')
    expect(mockWrite).toHaveBeenCalledWith('/path/to/file.md', '')
  })
})
