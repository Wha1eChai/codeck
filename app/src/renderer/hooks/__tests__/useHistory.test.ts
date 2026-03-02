// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from '../useHistory'
import { installMockElectron, uninstallMockElectron } from '../../__test-utils__/mock-electron'
import type { MockElectronAPI } from '../../__test-utils__/mock-electron'
import type { HistoryEntry } from '@common/types'

let mockElectron: MockElectronAPI

const mockEntries: HistoryEntry[] = [
  { sessionId: 's1', title: 'Session 1', projectPath: '/p1', lastActivity: 1000, messageCount: 5 },
  { sessionId: 's2', title: 'Session 2', projectPath: '/p2', lastActivity: 2000, messageCount: 10 },
]

describe('useHistory', () => {
  beforeEach(() => {
    mockElectron = installMockElectron()
  })

  afterEach(() => {
    uninstallMockElectron()
  })

  it('loadHistory — fetches sessions via IPC', async () => {
    mockElectron.getAllSessions.mockResolvedValueOnce(mockEntries)

    const { result } = renderHook(() => useHistory())

    await act(async () => {
      await result.current.loadHistory()
    })

    expect(mockElectron.getAllSessions).toHaveBeenCalledTimes(1)
    expect(result.current.entries).toEqual(mockEntries)
    expect(result.current.isLoading).toBe(false)
  })

  it('loadHistory — handles error gracefully', async () => {
    mockElectron.getAllSessions.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useHistory())

    await act(async () => {
      await result.current.loadHistory()
    })

    expect(result.current.entries).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('searchHistory — calls searchSessions IPC', async () => {
    const searchResults: HistoryEntry[] = [mockEntries[0]]
    mockElectron.searchSessions.mockResolvedValueOnce(searchResults)

    const { result } = renderHook(() => useHistory())

    await act(async () => {
      await result.current.searchHistory('Session 1')
    })

    expect(mockElectron.searchSessions).toHaveBeenCalledWith('Session 1')
    expect(result.current.entries).toEqual(searchResults)
  })

  it('searchHistory — falls back to loadHistory for empty query', async () => {
    mockElectron.getAllSessions.mockResolvedValueOnce(mockEntries)

    const { result } = renderHook(() => useHistory())

    await act(async () => {
      await result.current.searchHistory('  ')
    })

    expect(mockElectron.searchSessions).not.toHaveBeenCalled()
    expect(mockElectron.getAllSessions).toHaveBeenCalledTimes(1)
  })

  it('syncAndLoad — triggers sync then reloads', async () => {
    mockElectron.triggerSync.mockResolvedValueOnce(undefined)
    mockElectron.getAllSessions.mockResolvedValueOnce(mockEntries)

    const { result } = renderHook(() => useHistory())

    await act(async () => {
      await result.current.syncAndLoad()
    })

    expect(mockElectron.triggerSync).toHaveBeenCalledTimes(1)
    expect(mockElectron.getAllSessions).toHaveBeenCalledTimes(1)
    expect(result.current.syncStatus).toBe('idle')
    expect(result.current.entries).toEqual(mockEntries)
  })

  it('subscribes to onSyncCompleted on mount', () => {
    renderHook(() => useHistory())
    expect(mockElectron.onSyncCompleted).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes onSyncCompleted on unmount', () => {
    const unsubFn = vi.fn()
    mockElectron.onSyncCompleted.mockReturnValue(unsubFn)

    const { unmount } = renderHook(() => useHistory())
    unmount()

    expect(unsubFn).toHaveBeenCalledTimes(1)
  })
})
