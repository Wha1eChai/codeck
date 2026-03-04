import React, { useMemo, useState } from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import type { AssistantFlowStep, AssistantToolStep, AssistantHookStep, AssistantThinkingStep } from '@renderer/lib/conversation-reducer'
import { cn } from '@renderer/lib/utils'
import { buildToolBlockViewModel } from '@renderer/lib/tool-presentation'
import { DiffView } from './DiffView'
import { ShowMoreText } from './primitives'
import { MessageMarkdown } from './MessageMarkdown'
import { FlowNode } from './FlowNode'

// ── Thinking ──────────────────────────────────────────────────────────

export interface ThinkingNodeDetailProps {
  step: AssistantThinkingStep
}

export const ThinkingNodeDetail: React.FC<ThinkingNodeDetailProps> = ({ step }) => {
  const [expanded, setExpanded] = useState(false)
  const normalized = step.content.trim()
  const keyLine = extractKeyLine(normalized)
  const hasDetails = normalized.length > keyLine.length + 8

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{keyLine}</p>

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <ShowMoreText
              text={normalized}
              maxChars={900}
              className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pt-1"
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Tool ──────────────────────────────────────────────────────────────

export interface ToolNodeDetailProps {
  step: AssistantToolStep
}

export const ToolNodeDetail: React.FC<ToolNodeDetailProps> = ({ step }) => {
  const baseMessage = step.useMessage ?? step.resultMessage
  const model = useMemo(
    () => (baseMessage ? buildToolBlockViewModel(baseMessage, step.resultMessage) : null),
    [baseMessage, step.resultMessage],
  )
  const resultText = readResultText(step)

  // Bash: unified I/O block
  if (step.toolName === 'Bash') {
    const command = (step.useMessage?.toolInput as Record<string, unknown>)?.command
    return (
      <div className="rounded border border-border/30 bg-card/50 overflow-hidden font-mono text-xs">
        {command != null && (
          <div className="px-2.5 py-1.5 border-b border-border/20 text-foreground/80">
            <span className="text-muted-foreground/60 select-none mr-2">{'$ '}</span>
            <span>{String(command)}</span>
          </div>
        )}
        {resultText && (
          <div className="px-2.5 py-1.5 text-muted-foreground whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {resultText}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {step.progressMessages.length > 1 &&
        step.progressMessages.map((p) => (
          <div key={p.id} className="text-muted-foreground">{p.content}</div>
        ))
      }
      {model && <ToolInputDetail model={model} />}
      {resultText && (
        <ShowMoreText
          text={resultText}
          maxChars={560}
          className="whitespace-pre-wrap break-words text-foreground/80"
        />
      )}
    </>
  )
}

interface ToolInputDetailProps {
  model: ReturnType<typeof buildToolBlockViewModel>
}

const ToolInputDetail: React.FC<ToolInputDetailProps> = ({ model }) => {
  if (model.contentKind === 'diff' && model.oldStr !== undefined && model.newStr !== undefined) {
    return <DiffView oldStr={model.oldStr} newStr={model.newStr} filePath={model.filePath} />
  }

  if (model.contentKind === 'write' && model.writeContent) {
    return (
      <pre className="rounded border border-border/30 bg-card/50 p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap text-xs">
        {model.writeContent}
      </pre>
    )
  }

  if (model.contentKind === 'json' && model.input) {
    return (
      <pre className="rounded border border-border/30 bg-card/50 p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap text-xs">
        {JSON.stringify(model.input, null, 2)}
      </pre>
    )
  }

  return null
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface HookNodeDetailProps {
  step: AssistantHookStep
}

export const HookNodeDetail: React.FC<HookNodeDetailProps> = ({ step }) => {
  if (!step.hookOutput) return null

  return (
    <div className={cn(
      'text-xs px-2 py-1 rounded border border-border/40',
      step.hookStatus === 'failed'
        ? 'text-red-500/90 bg-red-500/5'
        : 'text-muted-foreground bg-muted/10',
    )}>
      {step.hookOutput}
    </div>
  )
}

// ── Agent ─────────────────────────────────────────────────────────────

export interface AgentNodeDetailProps {
  step: AssistantToolStep
}

export const AgentNodeDetail: React.FC<AgentNodeDetailProps> = ({ step }) => {
  const childSteps = step.childSteps ?? []
  const childTextSteps = childSteps.filter(s => s.kind === 'text')
  const childToolSteps = childSteps.filter((s): s is AssistantToolStep => s.kind === 'tool')

  return (
    <div className="border-l-2 border-purple-400/40 pl-3 ml-1 space-y-1">
      {childTextSteps.map(textStep => (
        <div key={textStep.id} className="px-2 text-sm">
          <MessageMarkdown content={textStep.content} />
        </div>
      ))}
      {childToolSteps.map(childStep => {
        const childModel = childStep.useMessage
          ? buildToolBlockViewModel(childStep.useMessage, childStep.resultMessage)
          : null
        return (
          <FlowNode
            key={childStep.id}
            icon={<Bot className="h-3.5 w-3.5 text-purple-500" />}
            title={childModel?.displayName ?? childStep.toolName}
            subtitle={childStep.status === 'completed' ? 'Done' : childStep.status === 'failed' ? 'Failed' : 'Running'}
            tone={childStep.status === 'failed' ? 'failed' : childStep.status === 'completed' ? 'success' : 'running'}
            summary={childModel?.summary}
            mcpBadge={childModel?.source === 'mcp' ? childModel.mcpServerName : undefined}
          >
            <ToolNodeDetail step={childStep} />
          </FlowNode>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

export function extractKeyLine(content: string): string {
  if (!content) return ''
  const firstLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)
  if (!firstLine) return ''

  const sentenceMatch = firstLine.match(/^(.+?[。.!?！？])(?:\s|$)/)
  return sentenceMatch?.[1]?.trim() || firstLine
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}

export function readResultText(step: AssistantToolStep): string | null {
  const raw = step.resultMessage?.toolResult ?? step.resultMessage?.content
  if (typeof raw === 'string' && raw.trim().length > 0) return raw
  if (raw === null || raw === undefined) return null
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

export function extractAgentName(step: AssistantToolStep): string {
  const input = step.useMessage?.toolInput
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>
    if (typeof rec.description === 'string' && rec.description.length > 0) {
      return rec.description
    }
    if (typeof rec.subagent_type === 'string') {
      return rec.subagent_type
    }
    if (typeof rec.name === 'string') {
      return rec.name
    }
  }
  return 'Agent'
}
