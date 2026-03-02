import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Key, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'

const SENSITIVE_PATTERNS = /key|token|secret|password|credential/i

export const EnvironmentSection: React.FC = () => {
    const [envVars, setEnvVars] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')

    const loadEnvVars = useCallback(async () => {
        try {
            const vars = await window.electron.getEnvVars()
            setEnvVars(vars)
        } catch {
            // Failed to load
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadEnvVars()
    }, [loadEnvVars])

    const handleAdd = async () => {
        const name = newName.trim()
        const value = newValue.trim()
        if (!name || !value) return

        await window.electron.setEnvVar(name, value)
        setEnvVars(prev => ({ ...prev, [name]: value }))
        setNewName('')
        setNewValue('')
    }

    const handleRemove = async (name: string) => {
        await window.electron.removeEnvVar(name)
        setEnvVars(prev => {
            const next = { ...prev }
            delete next[name]
            return next
        })
        setRevealedKeys(prev => {
            const next = new Set(prev)
            next.delete(name)
            return next
        })
    }

    const toggleReveal = (name: string) => {
        setRevealedKeys(prev => {
            const next = new Set(prev)
            if (next.has(name)) next.delete(name)
            else next.add(name)
            return next
        })
    }

    const isSensitive = (name: string) => SENSITIVE_PATTERNS.test(name)

    const maskValue = (value: string) => '\u2022'.repeat(Math.min(value.length, 24))

    const entries = Object.entries(envVars).sort(([a], [b]) => a.localeCompare(b))

    return (
        <div className="space-y-6">
            <StorageHint text="Saved to ~/.claude/settings.json" />

            <section className="space-y-3">
                <SectionHeader icon={Key} title="Environment Variables" />
                <SettingsCard className="space-y-3">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No environment variables configured.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {entries.map(([name, value]) => {
                                const sensitive = isSensitive(name)
                                const revealed = revealedKeys.has(name)
                                const displayValue = sensitive && !revealed ? maskValue(value) : value

                                return (
                                    <div
                                        key={name}
                                        className="flex items-center gap-2 group px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                                    >
                                        <span className="text-xs font-mono font-medium text-foreground min-w-[160px] truncate" title={name}>
                                            {name}
                                        </span>
                                        <span className="flex-1 text-xs font-mono text-muted-foreground truncate" title={sensitive && !revealed ? '' : value}>
                                            {displayValue}
                                        </span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {sensitive && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => toggleReveal(name)}
                                                    title={revealed ? 'Hide' : 'Reveal'}
                                                >
                                                    {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-destructive hover:text-destructive"
                                                onClick={() => handleRemove(name)}
                                                title="Remove"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Add new variable */}
                    <div className="flex gap-2 pt-2 border-t border-border/40">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                            placeholder="VARIABLE_NAME"
                            className="bg-background font-mono text-xs flex-[2]"
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Input
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Value"
                            className="bg-background text-xs flex-[3]"
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleAdd}
                            disabled={!newName.trim() || !newValue.trim()}
                            title="Add variable"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </SettingsCard>
            </section>
        </div>
    )
}
