import React, { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, Loader2, AlertCircle, ArrowDownRight, ArrowUpRight, Database, DollarSign } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import type { UsageCommand, UsageReport } from '@common/types'

const TABS: readonly { readonly id: UsageCommand; readonly label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'session', label: 'Session' },
] as const

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(0)}`
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(4)}`
}

function formatLastUpdated(ts: number | null): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

interface StatCardProps {
  readonly label: string
  readonly value: string
  readonly icon: React.FC<{ className?: string }>
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon }) => (
  <SettingsCard className="flex-1 min-w-[120px]">
    <div className="flex items-center gap-2 mb-1">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </SettingsCard>
)

export const UsageSection: React.FC = () => {
  const [tab, setTab] = useState<UsageCommand>('daily')
  const [data, setData] = useState<readonly UsageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const fetchData = useCallback(async (command: UsageCommand) => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.getUsageStats(command)
      setData(result)
      setLastUpdated(Date.now())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(tab)
  }, [tab, fetchData])

  // 会话结束后主进程推送通知，自动 re-fetch 当前 tab
  useEffect(() => {
    const unsubscribe = window.electron.onUsageStatsUpdated(() => {
      fetchData(tab)
    })
    return unsubscribe
  }, [tab, fetchData])

  const totals = data.reduce(
    (acc, r) => ({
      totalTokens: acc.totalTokens + r.totalTokens,
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      totalCost: acc.totalCost + r.totalCost,
    }),
    { totalTokens: 0, inputTokens: 0, outputTokens: 0, totalCost: 0 },
  )

  return (
    <div className="space-y-6">
      <StorageHint text="Data from ccusage — reads ~/.claude/ JSONL session files" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={BarChart3} title="Token Usage" />
          <div className="flex items-center gap-2">
            {lastUpdated && !loading && (
              <span className="text-[10px] text-muted-foreground/60">
                {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <button
              onClick={() => fetchData(tab)}
              disabled={loading}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        ) : error ? (
          <SettingsCard>
            <div className="flex items-start gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to load usage data</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </SettingsCard>
        ) : data.length === 0 ? (
          <SettingsCard>
            <div className="text-center py-8">
              <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No usage data found.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Start a Claude Code session to generate usage data.
              </p>
            </div>
          </SettingsCard>
        ) : (
          <>
            {/* Summary cards */}
            <div className="flex gap-3 flex-wrap">
              <StatCard label="Total" value={formatTokens(totals.totalTokens)} icon={Database} />
              <StatCard label="Input" value={formatTokens(totals.inputTokens)} icon={ArrowUpRight} />
              <StatCard label="Output" value={formatTokens(totals.outputTokens)} icon={ArrowDownRight} />
              <StatCard label="Cost" value={formatCost(totals.totalCost)} icon={DollarSign} />
            </div>

            {/* Detail rows */}
            <SettingsCard>
              <div className="divide-y divide-border/40">
                {/* Header */}
                <div className="flex items-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <span className="flex-1 min-w-[80px]">
                    {tab === 'daily' ? 'Date' : tab === 'monthly' ? 'Month' : 'Session'}
                  </span>
                  <span className="w-20 text-right">Input</span>
                  <span className="w-20 text-right">Output</span>
                  <span className="w-20 text-right">Cache R</span>
                  <span className="w-20 text-right">Total</span>
                  <span className="w-20 text-right">Cost</span>
                </div>

                {data.map((row, i) => {
                  const label = row.date ?? row.month ?? `#${i + 1}`
                  return (
                    <div key={label} className="py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-[80px] font-medium text-foreground truncate">{label}</span>
                        <span className="w-20 text-right text-muted-foreground font-mono text-xs">{formatTokens(row.inputTokens)}</span>
                        <span className="w-20 text-right text-muted-foreground font-mono text-xs">{formatTokens(row.outputTokens)}</span>
                        <span className="w-20 text-right text-muted-foreground font-mono text-xs">{formatTokens(row.cacheReadTokens)}</span>
                        <span className="w-20 text-right text-foreground font-mono text-xs">{formatTokens(row.totalTokens)}</span>
                        <span className="w-20 text-right text-foreground font-mono text-xs font-medium">{formatCost(row.totalCost)}</span>
                      </div>

                      {/* Model breakdown (expandable inline) */}
                      {row.modelBreakdowns && row.modelBreakdowns.length > 0 && (
                        <div className="mt-1.5 ml-2 space-y-1">
                          {row.modelBreakdowns.map((m) => (
                            <div key={m.modelName} className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                              <span className="flex-1 min-w-[80px] pl-2 truncate">{m.modelName}</span>
                              <span className="w-20 text-right font-mono">{formatTokens(m.inputTokens)}</span>
                              <span className="w-20 text-right font-mono">{formatTokens(m.outputTokens)}</span>
                              <span className="w-20 text-right font-mono">{formatTokens(m.cacheReadTokens)}</span>
                              <span className="w-20 text-right font-mono">
                                {formatTokens(m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreationTokens)}
                              </span>
                              <span className="w-20 text-right font-mono">{formatCost(m.cost)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SettingsCard>
          </>
        )}
      </section>
    </div>
  )
}
