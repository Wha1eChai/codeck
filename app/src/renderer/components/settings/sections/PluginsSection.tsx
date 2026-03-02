import React, { useState, useEffect, useCallback } from 'react'
import { Switch } from '../../ui/Switch'
import { Puzzle, Loader2, Package } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import type { PluginInfo } from '@common/types'

export const PluginsSection: React.FC = () => {
  const [plugins, setPlugins] = useState<readonly PluginInfo[]>([])
  const [loading, setLoading] = useState(true)

  const loadPlugins = useCallback(async () => {
    try {
      const result = await window.electron.getPlugins()
      setPlugins(result)
    } catch {
      // Failed to load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    // Optimistic update
    setPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, enabled } : p,
    ))
    try {
      await window.electron.setPluginEnabled(pluginId, enabled)
    } catch {
      // Rollback
      setPlugins(prev => prev.map(p =>
        p.id === pluginId ? { ...p, enabled: !enabled } : p,
      ))
    }
  }

  return (
    <div className="space-y-6">
      <StorageHint text="Plugin states saved to ~/.claude/settings.json" />

      <section className="space-y-3">
        <SectionHeader icon={Puzzle} title="Installed Plugins" />
        <SettingsCard>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : plugins.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No plugins installed.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Install plugins via Claude Code CLI to manage them here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {plugins.map((plugin) => (
                <div key={plugin.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {plugin.id}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
                        v{plugin.version}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {plugin.marketplace}
                      {plugin.lastUpdated && ` \u00B7 Updated ${plugin.lastUpdated}`}
                    </p>
                  </div>
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(checked) => handleToggle(plugin.id, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </SettingsCard>
      </section>
    </div>
  )
}
