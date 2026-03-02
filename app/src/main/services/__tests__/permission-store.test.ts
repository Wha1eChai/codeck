import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PersistentPermissionStore } from '../permission-store'
import { claudeFilesService } from '../claude-files'

vi.mock('../claude-files', () => ({
  claudeFilesService: {
    getProjectMetadata: vi.fn(),
    updateProjectMetadata: vi.fn(),
  },
}))

const mockGetMeta = vi.mocked(claudeFilesService.getProjectMetadata)
const mockUpdateMeta = vi.mocked(claudeFilesService.updateProjectMetadata)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PersistentPermissionStore', () => {
  it('get returns undefined for unknown key', () => {
    const store = new PersistentPermissionStore('/project')
    expect(store.get('unknown')).toBeUndefined()
  })

  it('set and get round-trip', () => {
    const store = new PersistentPermissionStore('/project')
    mockUpdateMeta.mockResolvedValue(undefined)

    store.set('tool:Read', { allowed: true, scope: 'tool' })
    expect(store.get('tool:Read')).toEqual({ allowed: true, scope: 'tool' })
  })

  it('set fires save (fire-and-forget)', () => {
    const store = new PersistentPermissionStore('/project')
    mockUpdateMeta.mockResolvedValue(undefined)

    store.set('tool:Bash', { allowed: false, reason: 'Denied' })

    expect(mockUpdateMeta).toHaveBeenCalledWith('/project', {
      permissionDecisions: {
        'tool:Bash': { allowed: false, reason: 'Denied' },
      },
    })
  })

  it('load populates cache from metadata', async () => {
    mockGetMeta.mockResolvedValue({
      permissionDecisions: {
        'tool:Read': { allowed: true, scope: 'tool' },
        'Bash:{"command":"ls"}': { allowed: true },
      },
    })

    const store = new PersistentPermissionStore('/project')
    await store.load()

    expect(store.get('tool:Read')).toEqual({ allowed: true, scope: 'tool' })
    expect(store.get('Bash:{"command":"ls"}')).toEqual({ allowed: true })
  })

  it('load ignores invalid decision entries', async () => {
    mockGetMeta.mockResolvedValue({
      permissionDecisions: {
        'valid': { allowed: true },
        'invalid-string': 'not-a-decision',
        'invalid-null': null,
        'invalid-number': 42,
      },
    })

    const store = new PersistentPermissionStore('/project')
    await store.load()

    expect(store.get('valid')).toEqual({ allowed: true })
    expect(store.get('invalid-string')).toBeUndefined()
    expect(store.get('invalid-null')).toBeUndefined()
    expect(store.get('invalid-number')).toBeUndefined()
  })

  it('load handles missing permissionDecisions gracefully', async () => {
    mockGetMeta.mockResolvedValue({})

    const store = new PersistentPermissionStore('/project')
    await store.load()

    expect(store.get('anything')).toBeUndefined()
  })

  it('clear removes all cached decisions', () => {
    const store = new PersistentPermissionStore('/project')
    mockUpdateMeta.mockResolvedValue(undefined)

    store.set('tool:Read', { allowed: true })
    store.clear()

    expect(store.get('tool:Read')).toBeUndefined()
  })

  it('save serializes current cache', async () => {
    mockGetMeta.mockResolvedValue({
      permissionDecisions: {
        'existing': { allowed: true },
      },
    })
    mockUpdateMeta.mockResolvedValue(undefined)

    const store = new PersistentPermissionStore('/project')
    await store.load()
    store.set('new-key', { allowed: false, reason: 'test' })

    await store.save()

    expect(mockUpdateMeta).toHaveBeenLastCalledWith('/project', {
      permissionDecisions: {
        'existing': { allowed: true },
        'new-key': { allowed: false, reason: 'test' },
      },
    })
  })
})
