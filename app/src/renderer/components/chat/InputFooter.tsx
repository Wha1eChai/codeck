import React, { useEffect, useState } from 'react'
import { Shield, Folder, GitBranch, Cpu, Zap } from 'lucide-react'
import { useSessionStore } from '../../stores/session-store'
import { useSettingsStore } from '../../stores/settings-store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/Select'
import {
  PermissionMode,
  PERMISSION_MODE_OPTIONS,
  MODEL_ALIAS_OPTIONS,
  EFFORT_LEVEL_OPTIONS,
} from '@common/types'
import { cn } from '../../lib/utils'

/** Sentinel values for "no explicit override" in Select components. */
const MODEL_DEFAULT = '__default__'
const EFFORT_AUTO = '__auto__'

interface InputFooterProps {
  readonly isStreaming: boolean
  readonly statusText: string
  readonly charCount: number
}

function projectDisplayName(projectPath: string): string {
  return projectPath.split(/[/\\]/).filter(Boolean).pop() ?? projectPath
}

export const InputFooter: React.FC<InputFooterProps> = ({ isStreaming, statusText, charCount }) => {
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const projectPath = useSessionStore(s => s.projectPath)
  const updateSession = useSessionStore(s => s.updateSession)
  const updateSettings = useSettingsStore(s => s.updateSettings)
  const model = useSettingsStore(s => s.executionOptions.model)
  const effort = useSettingsStore(s => s.executionOptions.effort)
  const updateExecOptions = useSettingsStore(s => s.updateExecutionOptions)
  const [gitBranch, setGitBranch] = useState<string | null>(null)

  const currentSession = useSessionStore(s =>
    currentSessionId ? s.sessions.find(sess => sess.id === currentSessionId) : undefined
  )

  const handleModeChange = (mode: PermissionMode) => {
    if (currentSessionId) {
      updateSession(currentSessionId, { permissionMode: mode })
      updateSettings({ defaultPermissionMode: mode })
    }
  }

  const handleModelChange = (value: string) => {
    updateExecOptions({ model: value === MODEL_DEFAULT ? undefined : value })
  }

  const handleEffortChange = (value: string) => {
    updateExecOptions({ effort: value === EFFORT_AUTO ? undefined : value as 'low' | 'medium' | 'high' | 'max' })
  }

  // Fetch git branch when project/session changes
  useEffect(() => {
    if (!projectPath) {
      setGitBranch(null)
      return
    }
    let cancelled = false
    window.electron.getGitBranch(projectPath).then(branch => {
      if (!cancelled) setGitBranch(branch)
    }).catch(() => {
      if (!cancelled) setGitBranch(null)
    })
    return () => { cancelled = true }
  }, [projectPath, currentSessionId])

  const modelSelectValue = model || MODEL_DEFAULT
  const effortSelectValue = effort || EFFORT_AUTO

  return (
    <div className="px-3 py-1.5 border-t bg-muted/20 rounded-b-xl flex items-center justify-between text-caption text-muted-foreground">
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <span className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", isStreaming ? "bg-status-active animate-pulse" : "bg-status-idle")} />
          {statusText}
        </span>

        {/* Permission mode selector */}
        {currentSession && (
          <span className="flex items-center gap-1 border-l pl-3 border-border">
            <Shield className="h-3 w-3 opacity-60" />
            <Select
              value={currentSession.permissionMode}
              onValueChange={(v) => handleModeChange(v as PermissionMode)}
            >
              <SelectTrigger className="border-0 bg-transparent h-5 shadow-none px-1 py-0 text-caption min-w-0 w-auto gap-1 [&>svg]:h-3 [&>svg]:w-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_MODE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        )}

        {/* Model alias selector */}
        <span className="flex items-center gap-1 border-l pl-3 border-border">
          <Cpu className="h-3 w-3 opacity-60" />
          <Select value={modelSelectValue} onValueChange={handleModelChange}>
            <SelectTrigger className="border-0 bg-transparent h-5 shadow-none px-1 py-0 text-caption min-w-0 w-auto gap-1 [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_ALIAS_OPTIONS.map(opt => (
                <SelectItem key={opt.value || MODEL_DEFAULT} value={opt.value || MODEL_DEFAULT}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>

        {/* Effort level selector */}
        <span className="flex items-center gap-1 border-l pl-3 border-border">
          <Zap className="h-3 w-3 opacity-60" />
          <Select value={effortSelectValue} onValueChange={handleEffortChange}>
            <SelectTrigger className="border-0 bg-transparent h-5 shadow-none px-1 py-0 text-caption min-w-0 w-auto gap-1 [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORT_LEVEL_OPTIONS.map(opt => (
                <SelectItem key={opt.value || EFFORT_AUTO} value={opt.value || EFFORT_AUTO}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>

        {/* Git branch */}
        {gitBranch && (
          <span className="flex items-center gap-1 border-l pl-3 border-border opacity-70">
            <GitBranch className="h-3 w-3" />
            <span className="font-mono truncate max-w-[120px]">{gitBranch}</span>
          </span>
        )}

        {/* Project folder */}
        {projectPath && (
          <span className="flex items-center gap-1 border-l pl-3 border-border opacity-70">
            <Folder className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{projectDisplayName(projectPath)}</span>
          </span>
        )}
      </div>

      <div className="font-mono text-muted-foreground-subtle">
        {charCount > 0 && <span>{charCount} chars</span>}
      </div>
    </div>
  )
}
