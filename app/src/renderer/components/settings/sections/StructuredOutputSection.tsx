import React, { useCallback, useMemo, useState } from 'react'
import { Braces } from 'lucide-react'
import { Input } from '../../ui/Input'
import { Switch } from '../../ui/Switch'
import { Textarea } from '../../ui/Textarea'
import { Button } from '../../ui/Button'
import { useSettingsStore } from '../../../stores/settings-store'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import type { StructuredOutputConfig } from '@common/types'

const DEFAULT_CONFIG: StructuredOutputConfig = {
    enabled: false,
    name: '',
    schema: '',
}

export const StructuredOutputSection: React.FC = () => {
    const structuredOutput = useSettingsStore(s => s.settings.structuredOutput) ?? DEFAULT_CONFIG
    const updateSettings = useSettingsStore(s => s.updateSettings)

    // Local draft state to avoid persisting on every keystroke
    const [draft, setDraft] = useState<StructuredOutputConfig>(structuredOutput)

    // Track whether the draft has diverged from the persisted value
    const isDirty = useMemo(() =>
        draft.enabled !== structuredOutput.enabled
        || draft.name !== structuredOutput.name
        || draft.description !== structuredOutput.description
        || draft.schema !== structuredOutput.schema,
    [draft, structuredOutput],
    )

    const schemaValid = useMemo(() => {
        if (!draft.schema.trim()) return null // empty = neutral
        try {
            JSON.parse(draft.schema)
            return true
        } catch {
            return false
        }
    }, [draft.schema])

    const canSave = draft.name.trim().length > 0
        && (schemaValid === true || !draft.schema.trim())
        && isDirty

    const handleSave = useCallback(() => {
        updateSettings({
            structuredOutput: {
                enabled: draft.enabled,
                name: draft.name.trim(),
                ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
                schema: draft.schema,
            },
        })
    }, [draft, updateSettings])

    const handleToggle = useCallback((enabled: boolean) => {
        const next = { ...draft, enabled }
        setDraft(next)
        // Persist toggle immediately so it takes effect on next session
        updateSettings({
            structuredOutput: {
                ...structuredOutput,
                enabled,
            },
        })
    }, [draft, structuredOutput, updateSettings])

    return (
        <div className="space-y-6">
            <StorageHint text="Persisted in app preferences" />

            <section className="space-y-3">
                <SectionHeader icon={Braces} title="Structured Output (JSON Schema)" />
                <SettingsCard className="space-y-4">
                    <p className="text-caption text-muted-foreground">
                        Force Claude to respond with JSON conforming to a schema.
                        The schema is passed to the SDK as <code className="text-xs bg-muted px-1 rounded">outputFormat</code>.
                    </p>

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-foreground">Enable Structured Output</label>
                            <p className="text-caption text-muted-foreground">When enabled, the schema is sent with every query.</p>
                        </div>
                        <Switch
                            checked={draft.enabled}
                            onCheckedChange={handleToggle}
                        />
                    </div>

                    {/* Schema Name */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Schema Name <span className="text-destructive">*</span></label>
                        <Input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="e.g. analysis_result"
                            className="bg-background font-mono text-xs"
                        />
                    </div>

                    {/* Description (optional) */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description</label>
                        <Input
                            value={draft.description ?? ''}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            placeholder="Optional description of the schema"
                            className="bg-background text-xs"
                        />
                    </div>

                    {/* JSON Schema */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">JSON Schema</label>
                            {schemaValid === true && (
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Valid JSON</span>
                            )}
                            {schemaValid === false && (
                                <span className="text-xs text-destructive font-medium">Invalid JSON</span>
                            )}
                        </div>
                        <Textarea
                            value={draft.schema}
                            onChange={(e) => setDraft({ ...draft, schema: e.target.value })}
                            placeholder={'{\n  "type": "object",\n  "properties": { ... },\n  "required": [ ... ]\n}'}
                            rows={10}
                            className="bg-background font-mono text-xs resize-y"
                        />
                    </div>

                    {/* Save button */}
                    <div className="pt-2 border-t border-border/40">
                        <Button
                            size="sm"
                            disabled={!canSave}
                            onClick={handleSave}
                        >
                            Save Schema
                        </Button>
                    </div>
                </SettingsCard>
            </section>
        </div>
    )
}
