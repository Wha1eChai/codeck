import React, { useState, useEffect, useCallback } from 'react'
import { createLogger } from '../../../lib/logger'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Server, Loader2, Plus, Trash2, User, Folder, Terminal } from 'lucide-react'

const logger = createLogger('McpServersSection')
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import type { McpServerConfig } from '@common/types'

export const McpServersSection: React.FC = () => {
  const [servers, setServers] = useState<readonly McpServerConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add form state
  const [newScope, setNewScope] = useState<'user' | 'project'>('user')
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')

  const loadServers = useCallback(async () => {
    try {
      const result = await window.electron.getMcpServers()
      setServers(result)
    } catch {
      // Failed to load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleAdd = async () => {
    if (!newName.trim() || !newCommand.trim()) return
    try {
      const args = newArgs.trim() ? newArgs.split(/\s+/) : []
      await window.electron.updateMcpServer(newScope, newName.trim(), {
        command: newCommand.trim(),
        args,
      })
      setNewName('')
      setNewCommand('')
      setNewArgs('')
      setShowAddForm(false)
      await loadServers()
    } catch (err) {
      logger.error('Failed to add MCP server:', err)
    }
  }

  const handleRemove = async (scope: 'user' | 'project', name: string) => {
    try {
      await window.electron.removeMcpServer(scope, name)
      setServers(prev => prev.filter(s => !(s.scope === scope && s.name === name)))
    } catch (err) {
      logger.error('Failed to remove MCP server:', err)
    }
  }

  const userServers = servers.filter(s => s.scope === 'user')
  const projectServers = servers.filter(s => s.scope === 'project')

  const renderServerList = (list: readonly McpServerConfig[]) => (
    <div className="space-y-2">
      {list.map((server) => (
        <div
          key={`${server.scope}:${server.name}`}
          className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Terminal className="h-4 w-4 mt-0.5 shrink-0 text-primary/70" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{server.name}</span>
            </div>
            <div className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
              {server.command} {server.args.join(' ')}
            </div>
            {server.env && Object.keys(server.env).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.keys(server.env).map((key) => (
                  <span
                    key={key}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                  >
                    {key}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive shrink-0"
            onClick={() => handleRemove(server.scope, server.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <StorageHint text="User scope: ~/.claude/settings.json | Project scope: .mcp.json" />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Server} title="MCP Servers" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Server
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <SettingsCard className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Scope</label>
                <Select value={newScope} onValueChange={(v) => setNewScope(v as 'user' | 'project')}>
                  <SelectTrigger className="bg-background h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my-server"
                  className="bg-background h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Command</label>
              <Input
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                placeholder="npx or uvx command"
                className="bg-background h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Arguments (space-separated)</label>
              <Input
                value={newArgs}
                onChange={(e) => setNewArgs(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-filesystem ..."
                className="bg-background h-8 text-xs font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newName.trim() || !newCommand.trim()}
                onClick={handleAdd}
              >
                Add
              </Button>
            </div>
          </SettingsCard>
        )}

        {/* Server List */}
        <SettingsCard>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No MCP servers configured.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add MCP servers to extend Claude's capabilities.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {userServers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
                    <User className="h-3 w-3" /> User Scope
                  </div>
                  {renderServerList(userServers)}
                </div>
              )}
              {projectServers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
                    <Folder className="h-3 w-3" /> Project Scope
                  </div>
                  {renderServerList(projectServers)}
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      </section>
    </div>
  )
}
