import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '../../ui/Button'
import { Webhook, Loader2, Plus, ChevronRight, ChevronDown, Save } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { HookRuleEditor } from './HookRuleEditor'
import type { CliHooks, CliHookRule, CliHookEventType } from '@common/types'

const EVENT_TYPES: readonly CliHookEventType[] = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentTool',
  'TaskCompleted',
  'TeammateIdle',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'UserPromptSubmit',
]

const EVENT_DESCRIPTIONS: Record<string, string> = {
  PreToolUse: 'Before a tool is executed',
  PostToolUse: 'After a tool completes',
  Notification: 'On notification events',
  Stop: 'When session ends',
  SubagentTool: 'When subagent uses a tool',
  TaskCompleted: 'When a task is completed',
  TeammateIdle: 'When a teammate goes idle',
  SessionStart: 'When a session starts',
  SessionEnd: 'When a session ends',
  PreCompact: 'Before context compaction',
  UserPromptSubmit: 'When user submits a prompt',
}

export const HooksSection: React.FC = () => {
  const [hooks, setHooks] = useState<CliHooks>({})
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set())
  const [newEventType, setNewEventType] = useState<CliHookEventType>('PreToolUse')

  const loadHooks = useCallback(async () => {
    try {
      const result = await window.electron.getCliHooks()
      setHooks(result)
    } catch {
      // Failed to load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.electron.updateCliHooks(hooks)
      setDirty(false)
    } catch (err) {
      console.error('Failed to save hooks:', err)
    } finally {
      setSaving(false)
    }
  }

  const toggleCollapse = (eventType: string) => {
    setCollapsedEvents(prev => {
      const next = new Set(prev)
      if (next.has(eventType)) next.delete(eventType)
      else next.add(eventType)
      return next
    })
  }

  const addRule = (eventType: string) => {
    const existing = hooks[eventType] ?? []
    const newRule: CliHookRule = { matcher: '', hooks: [{ type: 'command', command: '' }] }
    setHooks({ ...hooks, [eventType]: [...existing, newRule] })
    setDirty(true)
    // Ensure the event group is expanded
    setCollapsedEvents(prev => {
      const next = new Set(prev)
      next.delete(eventType)
      return next
    })
  }

  const updateRule = (eventType: string, index: number, rule: CliHookRule) => {
    const existing = hooks[eventType] ?? []
    const updated = existing.map((r, i) => (i === index ? rule : r))
    setHooks({ ...hooks, [eventType]: updated })
    setDirty(true)
  }

  const removeRule = (eventType: string, index: number) => {
    const existing = hooks[eventType] ?? []
    const updated = existing.filter((_, i) => i !== index)
    if (updated.length === 0) {
      const next = { ...hooks }
      delete (next as Record<string, unknown>)[eventType]
      setHooks(next)
    } else {
      setHooks({ ...hooks, [eventType]: updated })
    }
    setDirty(true)
  }

  const eventTypes = Object.keys(hooks)

  return (
    <div className="space-y-6">
      <StorageHint text="Saved to ~/.claude/settings.json → hooks" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Webhook} title="Event Hooks" />
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <SettingsCard>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </SettingsCard>
        ) : (
          <>
            {/* Existing hook groups */}
            {eventTypes.map((eventType) => {
              const rules = hooks[eventType] ?? []
              const isCollapsed = collapsedEvents.has(eventType)

              return (
                <SettingsCard key={eventType}>
                  <button
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => toggleCollapse(eventType)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">{eventType}</span>
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      ({rules.length} {rules.length === 1 ? 'rule' : 'rules'})
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {EVENT_DESCRIPTIONS[eventType] ?? ''}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="mt-3 space-y-2">
                      {rules.map((rule, idx) => (
                        <HookRuleEditor
                          key={idx}
                          rule={rule}
                          onChange={(updated) => updateRule(eventType, idx, updated)}
                          onRemove={() => removeRule(eventType, idx)}
                        />
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => addRule(eventType)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add rule
                      </Button>
                    </div>
                  )}
                </SettingsCard>
              )
            })}

            {/* Add new event type */}
            <SettingsCard>
              <div className="flex items-center gap-2">
                <Select value={newEventType} onValueChange={(v) => setNewEventType(v as CliHookEventType)}>
                  <SelectTrigger className="bg-background h-8 text-xs w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(et => (
                      <SelectItem key={et} value={et}>{et}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRule(newEventType)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Hook Rule
                </Button>
              </div>
            </SettingsCard>
          </>
        )}
      </section>
    </div>
  )
}
