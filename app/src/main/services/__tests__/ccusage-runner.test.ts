import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockLoadDailyUsageData = vi.hoisted(() => vi.fn())
const mockLoadMonthlyUsageData = vi.hoisted(() => vi.fn())
const mockLoadSessionData = vi.hoisted(() => vi.fn())

vi.mock('ccusage/data-loader', () => ({
  loadDailyUsageData: mockLoadDailyUsageData,
  loadMonthlyUsageData: mockLoadMonthlyUsageData,
  loadSessionData: mockLoadSessionData,
}))

import { runCcusage, warmUsageCache, invalidateUsageCache } from '../ccusage-runner'

const mockDailyRow = {
  date: '2026-02-27' as string & { readonly __brand: 'DailyDate' },
  inputTokens: 1000,
  outputTokens: 500,
  cacheCreationTokens: 100,
  cacheReadTokens: 200,
  totalCost: 0.05,
  modelsUsed: ['claude-sonnet-4-6'] as (string & { readonly __brand: 'ModelName' })[],
  modelBreakdowns: [],
}

const mockMonthlyRow = {
  month: '2026-02' as string & { readonly __brand: 'MonthlyDate' },
  inputTokens: 5000,
  outputTokens: 3000,
  cacheCreationTokens: 500,
  cacheReadTokens: 1000,
  totalCost: 1.23,
  modelsUsed: [] as (string & { readonly __brand: 'ModelName' })[],
  modelBreakdowns: [],
}

const mockSessionRow = {
  sessionId: 'session-abc-123' as string & { readonly __brand: 'SessionId' },
  projectPath: '/projects/foo' as string & { readonly __brand: 'ProjectPath' },
  inputTokens: 200,
  outputTokens: 100,
  cacheCreationTokens: 10,
  cacheReadTokens: 50,
  totalCost: 0.01,
  lastActivity: '2026-02-27' as string & { readonly __brand: 'ActivityDate' },
  versions: [] as (string & { readonly __brand: 'Version' })[],
  modelsUsed: [] as (string & { readonly __brand: 'ModelName' })[],
  modelBreakdowns: [],
}

describe('ccusage-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateUsageCache()
  })

  describe('runCcusage', () => {
    it('fetches daily data and computes totalTokens', async () => {
      mockLoadDailyUsageData.mockResolvedValue([mockDailyRow])

      const result = await runCcusage('daily')

      expect(result).toHaveLength(1)
      expect(result[0].date).toBe('2026-02-27')
      expect(result[0].totalCost).toBe(0.05)
      expect(result[0].totalTokens).toBe(1000 + 500 + 100 + 200)
    })

    it('fetches monthly data and maps month field', async () => {
      mockLoadMonthlyUsageData.mockResolvedValue([mockMonthlyRow])

      const result = await runCcusage('monthly')

      expect(result).toHaveLength(1)
      expect(result[0].month).toBe('2026-02')
      expect(result[0].totalTokens).toBe(5000 + 3000 + 500 + 1000)
    })

    it('fetches session data and maps sessionId to date', async () => {
      mockLoadSessionData.mockResolvedValue([mockSessionRow])

      const result = await runCcusage('session')

      expect(result).toHaveLength(1)
      expect(result[0].date).toBe('session-abc-123')
      expect(result[0].totalTokens).toBe(200 + 100 + 10 + 50)
    })

    it('returns cached data on second call without re-fetching', async () => {
      mockLoadDailyUsageData.mockResolvedValue([mockDailyRow])

      await runCcusage('daily')
      await runCcusage('daily')

      expect(mockLoadDailyUsageData).toHaveBeenCalledTimes(1)
    })

    it('re-fetches after invalidateUsageCache', async () => {
      mockLoadDailyUsageData.mockResolvedValue([mockDailyRow])

      await runCcusage('daily')
      invalidateUsageCache()
      await runCcusage('daily')

      expect(mockLoadDailyUsageData).toHaveBeenCalledTimes(2)
    })

    it('propagates loader errors', async () => {
      mockLoadDailyUsageData.mockRejectedValue(new Error('disk read error'))

      await expect(runCcusage('daily')).rejects.toThrow('disk read error')
    })
  })

  describe('warmUsageCache', () => {
    it('calls all three loaders in parallel', async () => {
      mockLoadDailyUsageData.mockResolvedValue([])
      mockLoadMonthlyUsageData.mockResolvedValue([])
      mockLoadSessionData.mockResolvedValue([])

      await warmUsageCache()

      expect(mockLoadDailyUsageData).toHaveBeenCalledTimes(1)
      expect(mockLoadMonthlyUsageData).toHaveBeenCalledTimes(1)
      expect(mockLoadSessionData).toHaveBeenCalledTimes(1)
    })

    it('subsequent runCcusage calls use cache after warmUsageCache', async () => {
      mockLoadDailyUsageData.mockResolvedValue([mockDailyRow])
      mockLoadMonthlyUsageData.mockResolvedValue([])
      mockLoadSessionData.mockResolvedValue([])

      await warmUsageCache()
      await runCcusage('daily')

      expect(mockLoadDailyUsageData).toHaveBeenCalledTimes(1)
    })

    it('does not throw when a loader fails', async () => {
      mockLoadDailyUsageData.mockRejectedValue(new Error('fail'))
      mockLoadMonthlyUsageData.mockResolvedValue([])
      mockLoadSessionData.mockResolvedValue([])

      await expect(warmUsageCache()).resolves.toBeUndefined()
    })
  })

  describe('invalidateUsageCache', () => {
    it('clears all cached commands', async () => {
      mockLoadDailyUsageData.mockResolvedValue([])
      mockLoadMonthlyUsageData.mockResolvedValue([])
      mockLoadSessionData.mockResolvedValue([])

      await warmUsageCache()
      invalidateUsageCache()

      await runCcusage('daily')
      await runCcusage('monthly')
      await runCcusage('session')

      expect(mockLoadDailyUsageData).toHaveBeenCalledTimes(2)
      expect(mockLoadMonthlyUsageData).toHaveBeenCalledTimes(2)
      expect(mockLoadSessionData).toHaveBeenCalledTimes(2)
    })
  })
})
