import React, { useState } from 'react'
import { Bot, User, ChevronDown, Info } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface MessageRowProps {
  children: React.ReactNode
  avatar: React.ReactNode
  className?: string
}

export const MessageRow: React.FC<MessageRowProps> = ({ children, avatar, className }) => (
  <div className={cn('flex gap-3 w-full', className)}>
    {avatar}
    <div className="flex flex-col flex-1 min-w-0 gap-2">
      {children}
    </div>
  </div>
)

interface MessageAvatarProps {
  role: 'user' | 'assistant'
  className?: string
}

export const MessageAvatar: React.FC<MessageAvatarProps> = ({ role, className }) => (
  <div
    className={cn(
      'shrink-0 w-[var(--chat-avatar-size)] h-[var(--chat-avatar-size)] rounded-full flex items-center justify-center mt-0.5 select-none',
      role === 'assistant'
        ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
        : 'bg-accent text-muted-foreground',
      className,
    )}
  >
    {role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
  </div>
)

interface MessageCardProps {
  children: React.ReactNode
  className?: string
}

export const MessageCard: React.FC<MessageCardProps> = ({ children, className }) => (
  <div
    className={cn(
      'rounded-[var(--chat-card-radius)] border border-border/60 bg-card shadow-sm overflow-hidden',
      className,
    )}
  >
    {children}
  </div>
)

interface MessageBubbleProps {
  children: React.ReactNode
  className?: string
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ children, className }) => (
  <div
    className={cn(
      'rounded-[var(--chat-card-radius)]',
      'bg-primary text-primary-foreground',
      'px-4 py-2.5 shadow-sm',
      className,
    )}
  >
    {children}
  </div>
)

type ToolChipStatus = 'running' | 'completed' | 'failed'

interface ToolChipProps {
  name: string
  status: ToolChipStatus
  summary?: string
  onClick?: () => void
  className?: string
}

const STATUS_STYLES: Record<ToolChipStatus, string> = {
  running: 'bg-blue-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
}

export const ToolChip: React.FC<ToolChipProps> = ({
  name,
  status,
  summary,
  onClick,
  className,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-2.5 w-full rounded-[var(--chat-tool-radius)]',
      'border border-border/50 bg-muted/30 hover:bg-muted/60',
      'px-3 py-2 text-sm transition-colors text-left cursor-pointer',
      className,
    )}
  >
    <span
      className={cn(
        'shrink-0 w-2 h-2 rounded-full',
        STATUS_STYLES[status],
        status === 'running' && 'animate-pulse',
      )}
    />

    <span className="font-medium text-foreground truncate">{name}</span>

    {summary && (
      <span className="ml-auto text-xs text-muted-foreground font-mono truncate max-w-[200px]">
        {summary}
      </span>
    )}
  </button>
)

interface CollapsibleSectionProps {
  label: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  headerClassName?: string
  className?: string
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  label,
  icon,
  defaultOpen = false,
  children,
  headerClassName,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-muted-foreground',
          'hover:bg-muted/40 transition-colors',
          headerClassName,
        )}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

interface SystemBannerProps {
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export const SystemBanner: React.FC<SystemBannerProps> = ({ children, icon, className }) => (
  <div className={cn('flex justify-center w-full', className)}>
    <div className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
      {icon ?? <Info className="h-3 w-3 opacity-60" />}
      <span>{children}</span>
    </div>
  </div>
)

interface FlowSectionProps {
  title: string
  count?: number
  summary?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export const FlowSection: React.FC<FlowSectionProps> = ({
  title,
  count,
  summary,
  icon,
  defaultOpen,
  children,
  className,
}) => {
  const label = count !== undefined ? `${title} (${count})` : title
  const fullLabel = summary ? `${label} - ${summary}` : label
  return (
    <div className={cn('rounded-[var(--chat-tool-radius)] border border-border/50 bg-muted/10 overflow-hidden', className)}>
      <CollapsibleSection
        label={fullLabel}
        icon={icon}
        defaultOpen={defaultOpen}
        headerClassName="bg-muted/20"
      >
        {children}
      </CollapsibleSection>
    </div>
  )
}

interface FlowTimelineProps {
  children: React.ReactNode
  className?: string
}

export const FlowTimeline: React.FC<FlowTimelineProps> = ({ children, className }) => (
  <ol className={cn('relative p-3 space-y-3', className)}>
    {children}
  </ol>
)

type FlowStepTone = 'neutral' | 'running' | 'success' | 'failed'

const FLOW_STEP_DOT_STYLES: Record<FlowStepTone, string> = {
  neutral: 'bg-muted-foreground/70',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-emerald-500',
  failed: 'bg-red-500',
}

interface FlowStepItemProps {
  title: string
  subtitle?: string
  tone?: FlowStepTone
  isLast?: boolean
  children: React.ReactNode
}

export const FlowStepItem: React.FC<FlowStepItemProps> = ({
  title,
  subtitle,
  tone = 'neutral',
  isLast = false,
  children,
}) => (
  <li className="relative pl-6">
    {!isLast && <span className="absolute left-[7px] top-3 h-full w-px bg-border/70" aria-hidden />}
    <span className={cn('absolute left-1 top-1.5 h-3 w-3 rounded-full border border-background', FLOW_STEP_DOT_STYLES[tone])} aria-hidden />

    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">{title}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  </li>
)

interface ShowMoreTextProps {
  text: string
  maxChars?: number
  className?: string
}

export const ShowMoreText: React.FC<ShowMoreTextProps> = ({
  text,
  maxChars = 420,
  className,
}) => {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= maxChars) {
    return <div className={className}>{text}</div>
  }

  const preview = text.slice(0, maxChars).trimEnd()
  return (
    <div className={cn('space-y-1', className)}>
      <div>{expanded ? text : `${preview}...`}</div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  )
}
