import React from 'react'
import { Input } from '../../ui/Input'
import { Button } from '../../ui/Button'
import { Trash2, Plus, X } from 'lucide-react'
import type { CliHookRule, CliHookEntry } from '@common/types'

interface HookRuleEditorProps {
  readonly rule: CliHookRule
  readonly onChange: (rule: CliHookRule) => void
  readonly onRemove: () => void
}

export const HookRuleEditor: React.FC<HookRuleEditorProps> = ({ rule, onChange, onRemove }) => {
  const updateMatcher = (matcher: string) => {
    onChange({ ...rule, matcher })
  }

  const updateHookCommand = (index: number, command: string) => {
    const hooks = rule.hooks.map((h, i) =>
      i === index ? { ...h, command } : h,
    )
    onChange({ ...rule, hooks })
  }

  const addHookEntry = () => {
    onChange({
      ...rule,
      hooks: [...rule.hooks, { type: 'command' as const, command: '' }],
    })
  }

  const removeHookEntry = (index: number) => {
    onChange({
      ...rule,
      hooks: rule.hooks.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-2.5 bg-background/50">
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Matcher
          </label>
          <Input
            value={rule.matcher}
            onChange={(e) => updateMatcher(e.target.value)}
            placeholder="Tool name or pattern (e.g. Bash, *)"
            className="bg-background h-7 text-xs font-mono"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive shrink-0 mt-4"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Commands
        </label>
        {rule.hooks.map((hook, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <Input
              value={hook.command}
              onChange={(e) => updateHookCommand(idx, e.target.value)}
              placeholder="shell command to execute"
              className="bg-background h-7 text-xs font-mono flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => removeHookEntry(idx)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={addHookEntry}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add command
        </Button>
      </div>
    </div>
  )
}
