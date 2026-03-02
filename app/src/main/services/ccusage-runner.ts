import {
  loadDailyUsageData,
  loadMonthlyUsageData,
  loadSessionData,
  type DailyUsage,
  type MonthlyUsage,
  type SessionUsage,
} from 'ccusage/data-loader'

export interface CcusageModelBreakdown {
  readonly modelName: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly cost: number
}

export interface CcusageReportRaw {
  readonly date?: string
  readonly month?: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly totalTokens: number
  readonly totalCost: number
  readonly modelsUsed?: readonly string[]
  readonly modelBreakdowns?: readonly CcusageModelBreakdown[]
}

export type CcusageCommand = 'daily' | 'monthly' | 'session'

// ── 缓存层 ────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

interface CacheEntry {
  data: readonly CcusageReportRaw[]
  timestamp: number
}

const cache = new Map<CcusageCommand, CacheEntry>()

// ── 对外 API ──────────────────────────────────────────────

/** 返回缓存数据（命中）或重新加载（过期） */
export async function runCcusage(command: CcusageCommand): Promise<readonly CcusageReportRaw[]> {
  const cached = cache.get(command)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }
  return fetchFresh(command)
}

/** App 启动时串行预热全部 3 个 command（避免并行触发多次 LiteLLM 定价请求） */
export async function warmUsageCache(): Promise<void> {
  for (const cmd of ['daily', 'monthly', 'session'] as CcusageCommand[]) {
    try {
      await fetchFresh(cmd)
    } catch {
      // Non-fatal — individual command failure doesn't block others
    }
  }
}

/** 清空缓存（会话结束时调用） */
export function invalidateUsageCache(): void {
  cache.clear()
}

// ── 内部 ──────────────────────────────────────────────────

async function fetchFresh(command: CcusageCommand): Promise<readonly CcusageReportRaw[]> {
  let data: readonly CcusageReportRaw[]

  if (command === 'daily') {
    const rows = await loadDailyUsageData()
    data = rows.map(mapDailyToReport)
  } else if (command === 'monthly') {
    const rows = await loadMonthlyUsageData()
    data = rows.map(mapMonthlyToReport)
  } else {
    const rows = await loadSessionData()
    data = rows.map(mapSessionToReport)
  }

  cache.set(command, { data, timestamp: Date.now() })
  return data
}

function mapDailyToReport(d: DailyUsage): CcusageReportRaw {
  return {
    date: d.date,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    cacheCreationTokens: d.cacheCreationTokens,
    cacheReadTokens: d.cacheReadTokens,
    totalTokens: d.inputTokens + d.outputTokens + d.cacheCreationTokens + d.cacheReadTokens,
    totalCost: d.totalCost,
    modelsUsed: d.modelsUsed,
    modelBreakdowns: d.modelBreakdowns,
  }
}

function mapMonthlyToReport(m: MonthlyUsage): CcusageReportRaw {
  return {
    month: m.month,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    cacheCreationTokens: m.cacheCreationTokens,
    cacheReadTokens: m.cacheReadTokens,
    totalTokens: m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens,
    totalCost: m.totalCost,
    modelsUsed: m.modelsUsed,
    modelBreakdowns: m.modelBreakdowns,
  }
}

function mapSessionToReport(s: SessionUsage): CcusageReportRaw {
  return {
    date: String(s.sessionId),
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheCreationTokens: s.cacheCreationTokens,
    cacheReadTokens: s.cacheReadTokens,
    totalTokens: s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens,
    totalCost: s.totalCost,
    modelsUsed: s.modelsUsed,
    modelBreakdowns: s.modelBreakdowns,
  }
}
