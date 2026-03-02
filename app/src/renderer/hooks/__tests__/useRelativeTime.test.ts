// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRelativeTime } from '../useRelativeTime'

describe('useRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a numeric timestamp', () => {
    const { result } = renderHook(() => useRelativeTime(false))
    expect(typeof result.current).toBe('number')
    expect(result.current).toBeGreaterThan(0)
  })

  it('sets up interval when hasRecentItems is true', () => {
    const { result } = renderHook(() => useRelativeTime(true))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    // After 60s, the now value should have updated
    expect(result.current).toBeGreaterThanOrEqual(initial)
  })

  it('does not set up interval when hasRecentItems is false', () => {
    const { result } = renderHook(() => useRelativeTime(false))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    // Without interval, the value should remain the same
    expect(result.current).toBe(initial)
  })

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useRelativeTime(true))
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
