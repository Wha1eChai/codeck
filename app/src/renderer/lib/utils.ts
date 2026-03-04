import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Relative Time ──

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * Format a timestamp as a human-friendly relative string.
 * Returns a tuple: [relativeText, fullDateString].
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): [string, string] {
  const diff = now - timestamp
  const fullDate = new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (diff < MINUTE) return ['just now', fullDate]
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE)
    return [`${mins}m ago`, fullDate]
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return [`${hours}h ago`, fullDate]
  }
  if (diff < 2 * DAY) return ['yesterday', fullDate]
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY)
    return [`${days}d ago`, fullDate]
  }
  if (diff < 2 * WEEK) return ['last week', fullDate]
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK)
    return [`${weeks}w ago`, fullDate]
  }
  if (diff < 2 * MONTH) return ['last month', fullDate]
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH)
    return [`${months}mo ago`, fullDate]
  }
  if (diff < 2 * YEAR) return ['last year', fullDate]
  const years = Math.floor(diff / YEAR)
  return [`${years}y ago`, fullDate]
}

/**
 * Determine an appropriate tick interval for relative time updates.
 * Only timestamps < 1 hour old need periodic refresh.
 */
export function getRefreshInterval(timestamp: number, now: number = Date.now()): number | null {
  const diff = now - timestamp
  if (diff < HOUR) return 60_000   // Refresh every 60s for recent items
  return null                       // No refresh needed for older items
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

/**
 * Legacy formatTime — kept for compatibility but prefer formatRelativeTime.
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
