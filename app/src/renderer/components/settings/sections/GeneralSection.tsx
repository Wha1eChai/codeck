import React, { useRef, useCallback } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Switch } from '../../ui/Switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '../../ui/Select'
import { useSettingsStore } from '../../../stores/settings-store'
import { PermissionMode, PERMISSION_MODE_OPTIONS, RuntimeProvider } from '@common/types'
import { FolderOpen, Search } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { useUIStore } from '../../../stores/ui-store'
import { Sliders, FileCode } from 'lucide-react'

const RUNTIME_OPTIONS: { value: RuntimeProvider; label: string }[] = [
    { value: 'claude', label: 'Claude (Default)' },
    { value: 'codex', label: 'Codex' },
    { value: 'opencode', label: 'OpenCode' },
]

export const GeneralSection: React.FC = () => {
    const settings = useSettingsStore(s => s.settings)
    const updateSettings = useSettingsStore(s => s.updateSettings)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleBrowseDefaultPath = async () => {
        const path = await window.electron.selectDirectory()
        if (path) {
            updateSettings({ defaultProjectPath: path })
            await window.electron.notifyProjectSelected(path)
        }
    }

    const handlePathChange = useCallback((value: string) => {
        updateSettings({ defaultProjectPath: value })
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (value.trim()) {
            debounceRef.current = setTimeout(async () => {
                try {
                    await window.electron.notifyProjectSelected(value.trim())
                } catch { /* Path may not exist yet */ }
            }, 600)
        }
    }, [updateSettings])

    return (
        <div className="space-y-6">
            <StorageHint text="Saved to app preferences" />

            {/* Appearance & Defaults */}
            <section className="space-y-4">
                <SectionHeader icon={Sliders} title="Preferences" />
                <SettingsCard className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Theme</label>
                            <Select
                                value={settings.theme}
                                onValueChange={(v) => updateSettings({ theme: v as any })}
                            >
                                <SelectTrigger className="bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="system">System</SelectItem>
                                    <SelectItem value="light">Light</SelectItem>
                                    <SelectItem value="dark">Dark</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Permission Mode</label>
                            <Select
                                value={settings.defaultPermissionMode}
                                onValueChange={(v) => updateSettings({ defaultPermissionMode: v as PermissionMode })}
                            >
                                <SelectTrigger className="bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PERMISSION_MODE_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Default Runtime</label>
                        <Select
                            value={settings.defaultRuntime ?? 'claude'}
                            onValueChange={(v) => updateSettings({ defaultRuntime: v as RuntimeProvider })}
                        >
                            <SelectTrigger className="bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RUNTIME_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Default Project Path</label>
                        <div className="flex gap-2">
                            <Input
                                value={settings.defaultProjectPath || ''}
                                onChange={(e) => handlePathChange(e.target.value)}
                                placeholder="Optional default path"
                                className="bg-background"
                            />
                            <Button variant="outline" size="icon" onClick={handleBrowseDefaultPath}>
                                <FolderOpen className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => useUIStore.getState().setProjectSelectorOpen(true)}
                                title="Browse Discovered Projects"
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </SettingsCard>
            </section>

            {/* Advanced */}
            <section className="space-y-3">
                <SectionHeader icon={FileCode} title="Advanced" />
                <SettingsCard>
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-foreground">File Checkpointing</label>
                            <p className="text-caption text-muted-foreground">Enable experimental file rewind capabilities.</p>
                        </div>
                        <Switch
                            checked={settings.checkpointEnabled !== false}
                            onCheckedChange={(c) => updateSettings({ checkpointEnabled: c })}
                        />
                    </div>
                </SettingsCard>
            </section>
        </div>
    )
}
