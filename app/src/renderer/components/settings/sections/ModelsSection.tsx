import React, { useCallback } from 'react'
import { Cpu, RotateCcw } from 'lucide-react'
import { Input } from '../../ui/Input'
import { Button } from '../../ui/Button'
import { useSettingsStore } from '../../../stores/settings-store'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { DEFAULT_MODEL_ALIASES } from '@common/defaults'

const ALIAS_ENTRIES = ['sonnet', 'opus', 'haiku'] as const

export const ModelsSection: React.FC = () => {
    const modelAliases = useSettingsStore(s => s.settings.modelAliases) ?? DEFAULT_MODEL_ALIASES
    const updateSettings = useSettingsStore(s => s.updateSettings)

    const handleAliasChange = useCallback((alias: string, fullId: string) => {
        const updated = { ...modelAliases, [alias]: fullId }
        updateSettings({ modelAliases: updated })
    }, [modelAliases, updateSettings])

    const handleReset = useCallback(() => {
        updateSettings({ modelAliases: DEFAULT_MODEL_ALIASES })
    }, [updateSettings])

    return (
        <div className="space-y-6">
            <StorageHint text="Persisted in app preferences" />

            <section className="space-y-3">
                <SectionHeader icon={Cpu} title="Model Alias Mappings" />
                <SettingsCard className="space-y-4">
                    <p className="text-caption text-muted-foreground">
                        Map short aliases to full model identifiers. These are used by the model selector and passed to the SDK.
                    </p>

                    {ALIAS_ENTRIES.map((alias) => (
                        <div key={alias} className="space-y-1.5">
                            <label className="text-sm font-medium capitalize">{alias}</label>
                            <Input
                                value={modelAliases[alias] ?? ''}
                                onChange={(e) => handleAliasChange(alias, e.target.value)}
                                placeholder={DEFAULT_MODEL_ALIASES[alias]}
                                className="bg-background font-mono text-xs"
                            />
                        </div>
                    ))}

                    <div className="pt-2 border-t border-border/40">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReset}
                            className="gap-1.5"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Reset to defaults
                        </Button>
                    </div>
                </SettingsCard>
            </section>
        </div>
    )
}
