import { describe, it, expect } from 'vitest'
import { encodeProjectPath, decodeProjectDirName } from './path-encoding.js'

const isWindows = process.platform === 'win32'

describe('encodeProjectPath', () => {
  it.skipIf(!isWindows)('encodes Windows drive paths', () => {
    const result = encodeProjectPath('C:\\projects\\my-app')
    expect(result).toBe('C--projects-my-app')
  })

  it.skipIf(!isWindows)('encodes Windows paths with forward slashes', () => {
    const result = encodeProjectPath('C:/projects/my-app')
    expect(result).toBe('C--projects-my-app')
  })

  it.skipIf(isWindows)('encodes Unix absolute paths as URL-encoded', () => {
    const result = encodeProjectPath('/home/user/project')
    expect(result).toBe('%2Fhome%2Fuser%2Fproject')
  })
})

describe('decodeProjectDirName', () => {
  it('decodes Windows drive format', () => {
    // Note: encoding is lossy — hyphens in original path become backslashes
    const result = decodeProjectDirName('C--projects-myproject')
    expect(result).toBe('C:\\projects\\myproject')
  })

  it.skipIf(!isWindows)('roundtrips a Windows path without hyphens', () => {
    const original = 'C:\\projects\\myproject'
    const encoded = encodeProjectPath(original)
    const decoded = decodeProjectDirName(encoded)
    expect(decoded).toBe(original)
  })

  it.skipIf(isWindows)('roundtrips a Unix path', () => {
    const original = '/home/user/myproject'
    const encoded = encodeProjectPath(original)
    const decoded = decodeProjectDirName(encoded)
    expect(decoded).toBe(original)
  })

  it('decodes URL-encoded format', () => {
    const result = decodeProjectDirName('%2Fhome%2Fuser%2Fproject')
    expect(result).toBe('/home/user/project')
  })

  it('returns null for unrecognized formats', () => {
    expect(decodeProjectDirName('just-a-hash-1234abcd')).toBeNull()
  })

  it('returns null for malformed URL encoding', () => {
    expect(decodeProjectDirName('%ZZ-invalid')).toBeNull()
  })
})
