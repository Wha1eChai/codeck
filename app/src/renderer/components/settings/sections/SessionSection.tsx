import React from 'react'
import { Input } from '../../ui/Input'
import { Switch } from '../../ui/Switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../ui/Select'
import { useSettingsStore } from '../../../stores/settings-store'
import { Terminal, Shield, X } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { MODEL_ALIAS_OPTIONS, EFFORT_LEVEL_OPTIONS, THINKING_MODE_OPTIONS } from '@common/types'
import type { ThinkingConfig } from '@common/types'

const MODEL_DEFAULT = '__default__'
const EFFORT_AUTO = '__auto__'
const THINKING_DEFAULT = '__default__'

export const SessionSection: React.FC = () => {
    const execOptions = useSettingsStore(s => s.executionOptions)
    const updateExecOptions = useSettingsStore(s => s.updateExecutionOptions)
    const hookSettings = useSettingsStore(s => s.hookSettings)
    const updateHookSettings = useSettingsStore(s => s.updateHookSettings)

    const modelSelectValue = execOptions.model || MODEL_DEFAULT
    const effortSelectValue = execOptions.effort || EFFORT_AUTO
    const thinkingSelectValue = execOptions.thinking?.type || THINKING_DEFAULT

    return (
        <div className="space-y-6">
            <StorageHint text="Current session only" />

            {/* Execution Params */}
            <section className="space-y-3">
                <SectionHeader icon={Terminal} title="Execution Context" />
                <SettingsCard className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Model</label>
                            <Select
                                value={modelSelectValue}
                                onValueChange={(v) => updateExecOptions({ model: v === MODEL_DEFAULT ? undefined : v })}
                            >
                                <SelectTrigger className="bg-background">
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
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Effort</label>
                            <Select
                                value={effortSelectValue}
                                onValueChange={(v) => updateExecOptions({ effort: v === EFFORT_AUTO ? undefined : v as 'low' | 'medium' | 'high' | 'max' })}
                            >
                                <SelectTrigger className="bg-background">
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
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Max Turns</label>
                            <Input
                                type="number"
                                min={1}
                                value={execOptions.maxTurns ?? ''}
                                onChange={(e) => updateExecOptions({ maxTurns: parseInt(e.target.value) || undefined })}
                                placeholder="Unlimited"
                                className="bg-background"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Budget ($)</label>
                            <Input
                                type="number"
                                step={0.01}
                                value={execOptions.maxBudgetUsd ?? ''}
                                onChange={(e) => updateExecOptions({ maxBudgetUsd: parseFloat(e.target.value) || undefined })}
                                placeholder="No limit"
                                className="bg-background"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Thinking Mode</label>
                            <Select
                                value={thinkingSelectValue}
                                onValueChange={(v) => {
                                    if (v === THINKING_DEFAULT) {
                                        updateExecOptions({ thinking: undefined })
                                    } else if (v === 'adaptive') {
                                        updateExecOptions({ thinking: { type: 'adaptive' } })
                                    } else if (v === 'enabled') {
                                        updateExecOptions({ thinking: { type: 'enabled' } })
                                    } else {
                                        updateExecOptions({ thinking: { type: 'disabled' } })
                                    }
                                }}
                            >
                                <SelectTrigger className="bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {THINKING_MODE_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value || THINKING_DEFAULT} value={opt.value || THINKING_DEFAULT}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {execOptions.thinking?.type === 'enabled' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Budget Tokens</label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={(execOptions.thinking as ThinkingConfig & { type: 'enabled' }).budgetTokens ?? ''}
                                    onChange={(e) => {
                                        const tokens = parseInt(e.target.value) || undefined
                                        updateExecOptions({ thinking: { type: 'enabled', budgetTokens: tokens } })
                                    }}
                                    placeholder="SDK default"
                                    className="bg-background"
                                />
                            </div>
                        )}
                    </div>
                </SettingsCard>
            </section>

            {/* Rules & Safety */}
            <section className="space-y-3">
                <SectionHeader icon={Shield} title="Rules & Safety" />
                <SettingsCard className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-foreground">Auto-allow Read Operations</label>
                            <p className="text-caption text-muted-foreground">Skip prompts for safe read-only commands (ls, cat, etc).</p>
                        </div>
                        <Switch
                            checked={hookSettings.autoAllowReadOnly}
                            onCheckedChange={(c) => updateHookSettings({ autoAllowReadOnly: c })}
                        />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/40">
                        <label className="text-sm font-medium">Blocked Commands</label>
                        <p className="text-caption text-muted-foreground">Commands matching these patterns will be auto-denied.</p>

                        {/* Tag-style blocked commands */}
                        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-background rounded border">
                            {hookSettings.blockedCommands
                                .filter(cmd => cmd.trim())
                                .map((cmd, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-mono rounded border border-red-500/20"
                                    >
                                        {cmd}
                                        <button
                                            className="hover:text-red-500 transition-colors"
                                            onClick={() => {
                                                const next = hookSettings.blockedCommands.filter((_, j) => j !== i)
                                                updateHookSettings({ blockedCommands: next })
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            <input
                                type="text"
                                className="flex-1 min-w-[120px] bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/50"
                                placeholder="Type and press Enter..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                        updateHookSettings({
                                            blockedCommands: [...hookSettings.blockedCommands, e.currentTarget.value.trim()]
                                        })
                                        e.currentTarget.value = ''
                                    }
                                }}
                            />
                        </div>

                        {/* Quick-add presets */}
                        <div className="flex gap-1.5 flex-wrap">
                            {['rm -rf', 'sudo', 'chmod 777', 'format', 'mkfs', 'dd if='].map(preset => (
                                <button
                                    key={preset}
                                    className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-destructive/50 transition-colors font-mono"
                                    onClick={() => {
                                        if (!hookSettings.blockedCommands.includes(preset)) {
                                            updateHookSettings({
                                                blockedCommands: [...hookSettings.blockedCommands, preset]
                                            })
                                        }
                                    }}
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>
                    </div>
                </SettingsCard>
            </section>
        </div>
    )
}
