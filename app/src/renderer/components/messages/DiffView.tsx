import React, { useMemo, useState } from 'react'
import { Columns2, Rows3 } from 'lucide-react'

export interface DiffLine {
  readonly type: '+' | '-' | ' '
  readonly content: string
  readonly oldLineNum?: number
  readonly newLineNum?: number
}

export interface DiffViewProps {
  readonly oldStr: string
  readonly newStr: string
  readonly filePath?: string
  readonly maxLines?: number
}

const DIFF_COMPLEXITY_THRESHOLD = 500_000

export function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const result: DiffLine[] = []

  const m = oldLines.length
  const n = newLines.length

  // Large file protection: if O(m*n) would be too expensive, degrade to full delete + full add
  if (m * n > DIFF_COMPLEXITY_THRESHOLD) {
    let oldLine = 1
    for (const line of oldLines) {
      result.push({ type: '-', content: line, oldLineNum: oldLine++, newLineNum: undefined })
    }
    result.push({ type: ' ', content: `⚠ Diff too large (${m}×${n} lines) — showing full replacement`, oldLineNum: undefined, newLineNum: undefined })
    let newLine = 1
    for (const line of newLines) {
      result.push({ type: '+', content: line, oldLineNum: undefined, newLineNum: newLine++ })
    }
    return result
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const diffs: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffs.push({ type: ' ', content: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffs.push({ type: '+', content: newLines[j - 1] })
      j--
    } else {
      diffs.push({ type: '-', content: oldLines[i - 1] })
      i--
    }
  }
  diffs.reverse()

  let oldLine = 1
  let newLine = 1
  for (const line of diffs) {
    if (line.type === '-') {
      result.push({ ...line, oldLineNum: oldLine++, newLineNum: undefined })
    } else if (line.type === '+') {
      result.push({ ...line, oldLineNum: undefined, newLineNum: newLine++ })
    } else {
      result.push({ ...line, oldLineNum: oldLine, newLineNum: newLine })
      oldLine++
      newLine++
    }
  }

  return result
}

const LINE_STYLES: Record<DiffLine['type'], string> = {
  '+': 'bg-green-500/15 text-green-800 dark:text-green-300',
  '-': 'bg-red-500/15 text-red-800 dark:text-red-300 line-through opacity-70',
  ' ': 'text-foreground/70',
}

const PREFIX_STYLES: Record<DiffLine['type'], string> = {
  '+': 'text-green-600 dark:text-green-400',
  '-': 'text-red-600 dark:text-red-400',
  ' ': 'text-muted-foreground',
}

type ViewMode = 'unified' | 'split'

export const DiffView: React.FC<DiffViewProps> = ({
  oldStr,
  newStr,
  filePath,
  maxLines = 50,
}) => {
  const [isFullyExpanded, setIsFullyExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('unified')

  const lines = useMemo(() => computeLineDiff(oldStr, newStr), [oldStr, newStr])
  const addedCount = lines.filter(line => line.type === '+').length
  const removedCount = lines.filter(line => line.type === '-').length

  const visibleLines = isFullyExpanded ? lines : lines.slice(0, maxLines)
  const hasOverflow = lines.length > maxLines && !isFullyExpanded

  const splitPairs = useMemo(() => {
    if (viewMode !== 'split') return []

    const pairs: Array<{ left?: DiffLine; right?: DiffLine }> = []
    let idx = 0
    while (idx < visibleLines.length) {
      const line = visibleLines[idx]
      if (line.type === ' ') {
        pairs.push({ left: line, right: line })
        idx++
        continue
      }

      if (line.type === '-') {
        const removals: DiffLine[] = []
        while (idx < visibleLines.length && visibleLines[idx].type === '-') {
          removals.push(visibleLines[idx++])
        }

        const additions: DiffLine[] = []
        while (idx < visibleLines.length && visibleLines[idx].type === '+') {
          additions.push(visibleLines[idx++])
        }

        const maxLen = Math.max(removals.length, additions.length)
        for (let i = 0; i < maxLen; i++) {
          pairs.push({ left: removals[i], right: additions[i] })
        }
        continue
      }

      pairs.push({ right: line })
      idx++
    }

    return pairs
  }, [visibleLines, viewMode])

  return (
    <div className="rounded border overflow-hidden text-xs font-mono">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b text-[11px]">
        <span className="text-muted-foreground truncate">
          {filePath || 'file change'}
        </span>
        <span className="flex items-center gap-2 shrink-0 ml-2">
          {removedCount > 0 && (
            <span className="text-red-600 dark:text-red-400">-{removedCount}</span>
          )}
          {addedCount > 0 && (
            <span className="text-green-600 dark:text-green-400">+{addedCount}</span>
          )}
          <span className="border-l pl-2 ml-1 flex gap-0.5">
            <button
              className={`p-0.5 rounded ${viewMode === 'unified' ? 'bg-accent/20 text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('unified')}
              title="Unified view"
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              className={`p-0.5 rounded ${viewMode === 'split' ? 'bg-accent/20 text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('split')}
              title="Split view"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </span>
      </div>

      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        {viewMode === 'unified' ? (
          visibleLines.map((line, idx) => (
            <div key={idx} className={`flex ${LINE_STYLES[line.type]} leading-5`}>
              <span className="w-8 shrink-0 text-right pr-1 select-none text-muted-foreground/50 text-[10px]">
                {line.oldLineNum ?? ''}
              </span>
              <span className="w-8 shrink-0 text-right pr-1 select-none text-muted-foreground/50 text-[10px]">
                {line.newLineNum ?? ''}
              </span>
              <span className={`w-4 shrink-0 text-center select-none ${PREFIX_STYLES[line.type]}`}>
                {line.type === ' ' ? ' ' : line.type}
              </span>
              <span className="px-1 whitespace-pre-wrap break-all flex-1">
                {line.content || '\u00A0'}
              </span>
            </div>
          ))
        ) : (
          splitPairs.map((pair, idx) => (
            <div key={idx} className="flex leading-5">
              <div className={`flex flex-1 min-w-0 ${pair.left ? LINE_STYLES[pair.left.type] : ''}`}>
                <span className="w-8 shrink-0 text-right pr-1 select-none text-muted-foreground/50 text-[10px]">
                  {pair.left?.oldLineNum ?? ''}
                </span>
                <span className="px-1 whitespace-pre-wrap break-all flex-1">
                  {pair.left?.content || '\u00A0'}
                </span>
              </div>
              <div className="w-px bg-border shrink-0" />
              <div className={`flex flex-1 min-w-0 ${pair.right ? LINE_STYLES[pair.right.type] : ''}`}>
                <span className="w-8 shrink-0 text-right pr-1 select-none text-muted-foreground/50 text-[10px]">
                  {pair.right?.newLineNum ?? ''}
                </span>
                <span className="px-1 whitespace-pre-wrap break-all flex-1">
                  {pair.right?.content || '\u00A0'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {hasOverflow && (
        <button
          className="w-full py-1.5 text-[11px] text-center text-blue-600 dark:text-blue-400 hover:bg-muted/50 border-t transition-colors"
          onClick={() => setIsFullyExpanded(true)}
        >
          Show all {lines.length} lines
        </button>
      )}

      {isFullyExpanded && lines.length > maxLines && (
        <button
          className="w-full py-1.5 text-[11px] text-center text-blue-600 dark:text-blue-400 hover:bg-muted/50 border-t transition-colors"
          onClick={() => setIsFullyExpanded(false)}
        >
          Collapse to first {maxLines} lines
        </button>
      )}
    </div>
  )
}
