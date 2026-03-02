import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { useClaude } from '../../hooks/useClaude'
import { ShieldAlert, HelpCircle, GitBranch, Check, X, Send } from 'lucide-react'

// ── ExitPlanMode choice values (mapped from option index) ──
type ExitPlanModeChoice = 'compact_execute' | 'auto_accept' | 'approve_manually' | 'keep_planning'

const EXIT_PLAN_MODE_CHOICES: ExitPlanModeChoice[] = [
  'compact_execute',
  'auto_accept',
  'approve_manually',
  'keep_planning',
]

// ── Option button color scheme ──
// Returns tailwind classes for a given option in a given context.
function optionStyle(
  kind: string,
  index: number,
  isSelected: boolean,
  isHighlighted: boolean,
): string {
  // Permission: Allow=green, Deny=muted
  if (kind === 'permission') {
    if (index === 0) {
      // Allow
      return isSelected
        ? 'border-green-500 bg-green-500/15 text-foreground'
        : 'border-green-500/30 bg-green-500/5 text-foreground hover:bg-green-500/10 hover:border-green-500/60'
    }
    // Deny
    return isSelected
      ? 'border-border bg-muted text-foreground'
      : 'border-border bg-background hover:bg-muted/50 text-foreground'
  }

  // ExitPlanMode option 0 (compact & execute) is highlighted
  if (isHighlighted) {
    return isSelected
      ? 'border-primary bg-primary/10 text-foreground'
      : 'border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10 hover:border-primary/60'
  }

  // Default
  return isSelected
    ? 'border-primary bg-primary/10 text-foreground'
    : 'border-border bg-background hover:bg-muted/50 text-foreground'
}

function badgeStyle(kind: string, index: number, isSelected: boolean): string {
  if (kind === 'permission' && index === 0) {
    return isSelected
      ? 'bg-green-500 text-white'
      : 'bg-green-500/10 text-green-600'
  }
  return isSelected
    ? 'bg-primary text-primary-foreground'
    : 'bg-muted text-muted-foreground'
}

export const InteractionPanel: React.FC = () => {
  const pendingInteraction = useUIStore(s => s.pendingInteraction)
  const setPendingInteraction = useUIStore(s => s.setPendingInteraction)
  const advanceAskUserQuestion = useUIStore(s => s.advanceAskUserQuestion)
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const { respondPermission, respondAskUserQuestion, respondExitPlanMode, sendMessage } = useClaude(currentSessionId)

  // Local state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [customInput, setCustomInput] = useState('')
  const [remember, setRemember] = useState(false)
  // Accumulated answers across AskUserQuestion steps
  const accumulatedAnswers = useRef<Record<string, string>>({})
  const customInputRef = useRef<HTMLTextAreaElement>(null)

  // Reset state when pendingInteraction changes
  useEffect(() => {
    setSelectedIndices(new Set())
    setCustomInput('')
    setRemember(false)
    if (pendingInteraction?.kind !== 'askUserQuestion') {
      accumulatedAnswers.current = {}
    }
  }, [pendingInteraction?.requestId, pendingInteraction?.questionIndex])

  const handlePermissionSubmit = useCallback(async (optionIndex: number) => {
    if (!pendingInteraction || pendingInteraction.kind !== 'permission') return
    const allowed = optionIndex === 0 // 0 = Allow, 1 = Deny
    await respondPermission({
      requestId: pendingInteraction.requestId,
      allowed,
      reason: !allowed ? (customInput || undefined) : undefined,
      rememberForSession: allowed && remember,
      rememberScope: (allowed && remember)
        ? (pendingInteraction.risk === 'high' ? 'input' : 'tool')
        : undefined,
    })
    setPendingInteraction(null)
  }, [pendingInteraction, respondPermission, setPendingInteraction, customInput, remember])

  // Submit AskUserQuestion with an explicit set of selected indices (avoids stale state issue)
  const submitAskUserQuestion = useCallback(async (activeIndices: Set<number>) => {
    if (!pendingInteraction || pendingInteraction.kind !== 'askUserQuestion') return
    if (!pendingInteraction.allQuestions) return

    const currentQuestion = pendingInteraction.allQuestions[pendingInteraction.questionIndex ?? 0]
    const questionText = currentQuestion.question

    const selectedLabels = Array.from(activeIndices)
      .sort()
      .map(i => pendingInteraction.options[i]?.label)
      .filter(Boolean)
      .join(', ')
    const answer = selectedLabels || customInput

    accumulatedAnswers.current = { ...accumulatedAnswers.current, [questionText]: answer }

    const nextIndex = (pendingInteraction.questionIndex ?? 0) + 1
    const isLastQuestion = nextIndex >= (pendingInteraction.totalQuestions ?? 1)

    if (isLastQuestion) {
      await respondAskUserQuestion({
        requestId: pendingInteraction.requestId,
        answers: accumulatedAnswers.current,
        cancelled: false,
      })
      accumulatedAnswers.current = {}
      setPendingInteraction(null)
    } else {
      advanceAskUserQuestion(nextIndex)
    }
  }, [pendingInteraction, customInput, respondAskUserQuestion, setPendingInteraction, advanceAskUserQuestion])

  const handleAskUserQuestionSubmit = useCallback(async () => {
    await submitAskUserQuestion(selectedIndices)
  }, [submitAskUserQuestion, selectedIndices])

  const handleAskUserQuestionCancel = useCallback(async () => {
    if (!pendingInteraction || pendingInteraction.kind !== 'askUserQuestion') return
    await respondAskUserQuestion({
      requestId: pendingInteraction.requestId,
      answers: {},
      cancelled: true,
    })
    accumulatedAnswers.current = {}
    setPendingInteraction(null)
  }, [pendingInteraction, respondAskUserQuestion, setPendingInteraction])

  const handleExitPlanModeSubmit = useCallback(async (optionIndex: number) => {
    if (!pendingInteraction || pendingInteraction.kind !== 'exitPlanMode') return
    const choice = EXIT_PLAN_MODE_CHOICES[optionIndex]
    const allowed = choice !== 'keep_planning'

    await respondExitPlanMode({
      requestId: pendingInteraction.requestId,
      allowed,
      feedback: !allowed ? (customInput || undefined) : undefined,
    })
    setPendingInteraction(null)

    if (choice === 'compact_execute') {
      await sendMessage('/compact')
    } else if (choice === 'auto_accept') {
      await window.electron.updateSettings({ defaultPermissionMode: 'acceptEdits' })
    }
  }, [pendingInteraction, respondExitPlanMode, setPendingInteraction, customInput, sendMessage])

  const handleCancel = useCallback(async () => {
    if (!pendingInteraction) return
    if (pendingInteraction.kind === 'permission') {
      await handlePermissionSubmit(1)
    } else if (pendingInteraction.kind === 'askUserQuestion') {
      await handleAskUserQuestionCancel()
    } else if (pendingInteraction.kind === 'exitPlanMode') {
      await handleExitPlanModeSubmit(3)
    }
  }, [pendingInteraction, handlePermissionSubmit, handleAskUserQuestionCancel, handleExitPlanModeSubmit])

  const handleOptionClick = useCallback((index: number) => {
    if (!pendingInteraction) return

    if (pendingInteraction.kind === 'permission') {
      handlePermissionSubmit(index)
    } else if (pendingInteraction.kind === 'exitPlanMode') {
      if (index === 3) {
        setSelectedIndices(new Set([index]))
        customInputRef.current?.focus()
      } else {
        handleExitPlanModeSubmit(index)
      }
    } else if (pendingInteraction.kind === 'askUserQuestion') {
      if (pendingInteraction.multiSelect) {
        setSelectedIndices(prev => {
          const next = new Set(prev)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          return next
        })
      } else {
        // Single-select: submit immediately (pass index directly to avoid stale state)
        submitAskUserQuestion(new Set([index]))
      }
    }
  }, [pendingInteraction, handlePermissionSubmit, handleExitPlanModeSubmit, submitAskUserQuestion])

  // Keyboard handling
  useEffect(() => {
    if (!pendingInteraction) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key)
      if (!isNaN(num) && num >= 1 && num <= pendingInteraction.options.length) {
        e.preventDefault()
        handleOptionClick(num - 1)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
        return
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        if (document.activeElement !== customInputRef.current) {
          if (pendingInteraction.kind === 'askUserQuestion' && selectedIndices.size > 0) {
            e.preventDefault()
            handleAskUserQuestionSubmit()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingInteraction, selectedIndices, handleOptionClick, handleCancel, handleAskUserQuestionSubmit])

  if (!pendingInteraction) return null

  const { kind, title, description, options, allowCustomInput, multiSelect } = pendingInteraction

  const isExitPlanNoOption = kind === 'exitPlanMode' && selectedIndices.has(3)
  const showCustomInput = allowCustomInput || isExitPlanNoOption
  const hasDescriptions = options.some(o => o.description)

  const KindIcon = kind === 'permission'
    ? ShieldAlert
    : kind === 'askUserQuestion'
    ? HelpCircle
    : GitBranch

  const riskColorClass = kind === 'permission' && pendingInteraction.risk
    ? pendingInteraction.risk === 'high'
      ? 'text-red-500'
      : pendingInteraction.risk === 'medium'
      ? 'text-yellow-500'
      : 'text-green-500'
    : 'text-primary'

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KindIcon className={`h-4 w-4 shrink-0 ${riskColorClass}`} />
            <span className="font-semibold text-sm text-foreground">{title}</span>
            {kind === 'askUserQuestion' && pendingInteraction.totalQuestions && pendingInteraction.totalQuestions > 1 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {(pendingInteraction.questionIndex ?? 0) + 1}/{pendingInteraction.totalQuestions}
              </span>
            )}
          </div>
          <button
            onClick={handleCancel}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            title="Cancel (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}

        {/* Options */}
        <div className="space-y-1.5">
          {options.map((option, i) => {
            const isSelected = selectedIndices.has(i)
            const isHighlighted = !!(option.highlighted && !selectedIndices.size)
            // Compact when no descriptions (e.g. permission Allow/Deny)
            const padding = hasDescriptions ? 'px-3 py-2.5' : 'px-3 py-2'
            const align = hasDescriptions ? 'items-start' : 'items-center'

            return (
              <button
                key={i}
                onClick={() => handleOptionClick(i)}
                className={[
                  `w-full flex ${align} gap-3 ${padding} rounded-lg border text-left transition-all text-sm`,
                  optionStyle(kind, i, isSelected, isHighlighted),
                ].join(' ')}
              >
                <span className={[
                  'shrink-0 w-5 h-5 rounded text-xs font-medium flex items-center justify-center',
                  hasDescriptions ? 'mt-0.5' : '',
                  badgeStyle(kind, i, isSelected),
                ].join(' ')}>
                  {multiSelect && isSelected ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Remember checkbox for permissions */}
        {kind === 'permission' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="rounded border-border"
            />
            {pendingInteraction.rememberLabel}
          </label>
        )}

        {/* Custom input (ExitPlanMode "keep planning" feedback) */}
        {showCustomInput && (
          <div className="flex gap-2">
            <textarea
              ref={customInputRef}
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder={kind === 'exitPlanMode' ? 'Tell Claude what to do instead…' : 'Optional reason…'}
              rows={2}
              className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (kind === 'exitPlanMode') handleExitPlanModeSubmit(3)
                  else if (kind === 'askUserQuestion') handleAskUserQuestionSubmit()
                }
              }}
            />
            {kind === 'exitPlanMode' && (
              <button
                onClick={() => handleExitPlanModeSubmit(3)}
                className="shrink-0 p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                title="Send feedback"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Multi-select submit button */}
        {multiSelect && selectedIndices.size > 0 && (
          <button
            onClick={handleAskUserQuestionSubmit}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" />
            {pendingInteraction.questionIndex !== undefined &&
              pendingInteraction.totalQuestions !== undefined &&
              pendingInteraction.questionIndex + 1 < pendingInteraction.totalQuestions
              ? 'Next →'
              : 'Submit'}
          </button>
        )}

        {/* Footer hint */}
        <p className="text-[11px] text-muted-foreground text-center opacity-60">
          {options.length <= 9 ? `Press ${options.map((_, i) => i + 1).join('/')} to select` : 'Click to select'}
          {' · Esc to cancel'}
        </p>
      </div>
    </div>
  )
}
