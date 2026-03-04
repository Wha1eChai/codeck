// ── Usage 统计（ccusage） ──

export type UsageCommand = 'daily' | 'monthly' | 'session'

export interface UsageModelBreakdown {
  readonly modelName: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly cost: number
}

export interface UsageReport {
  readonly date?: string
  readonly month?: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly totalTokens: number
  readonly totalCost: number
  readonly modelsUsed?: readonly string[]
  readonly modelBreakdowns?: readonly UsageModelBreakdown[]
}
