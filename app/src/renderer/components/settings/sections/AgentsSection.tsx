import React, { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2, ChevronRight, ChevronDown, User, Folder } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { ScrollArea } from '../../ui/ScrollArea'
import type { AgentInfo } from '@common/types'

export const AgentsSection: React.FC = () => {
  const [agents, setAgents] = useState<readonly AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [agentContent, setAgentContent] = useState<string>('')
  const [contentLoading, setContentLoading] = useState(false)

  const loadAgents = useCallback(async () => {
    try {
      const result = await window.electron.getAgents()
      setAgents(result)
    } catch {
      // Failed to load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const handleExpand = async (agent: AgentInfo) => {
    const key = `${agent.scope}:${agent.filename}`
    if (expandedAgent === key) {
      setExpandedAgent(null)
      return
    }
    setExpandedAgent(key)
    setContentLoading(true)
    try {
      const content = await window.electron.getAgentContent(agent.filename)
      setAgentContent(content)
    } catch {
      setAgentContent('Failed to load agent content.')
    } finally {
      setContentLoading(false)
    }
  }

  const userAgents = agents.filter(a => a.scope === 'user')
  const projectAgents = agents.filter(a => a.scope === 'project')

  const renderAgentList = (list: readonly AgentInfo[], scope: string) => (
    <div className="space-y-1">
      {list.map((agent) => {
        const key = `${agent.scope}:${agent.filename}`
        const isExpanded = expandedAgent === key
        return (
          <div key={key}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors text-left"
              onClick={() => handleExpand(agent)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <Bot className="h-4 w-4 shrink-0 text-primary/70" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{agent.name}</span>
                {agent.description && (
                  <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                {agent.filename}
              </span>
            </button>
            {isExpanded && (
              <div className="ml-9 mr-2 mb-2">
                {contentLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <ScrollArea className="max-h-64">
                    <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-words border">
                      {agentContent}
                    </pre>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <StorageHint text="Agent definitions from ~/.claude/agents/ and project .claude/agents/" />

      <section className="space-y-3">
        <SectionHeader icon={Bot} title="Agents" />
        <SettingsCard>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No agent definitions found.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create .md files in ~/.claude/agents/ to define custom agents.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {userAgents.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
                    <User className="h-3 w-3" /> User Scope
                  </div>
                  {renderAgentList(userAgents, 'user')}
                </div>
              )}
              {projectAgents.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
                    <Folder className="h-3 w-3" /> Project Scope
                  </div>
                  {renderAgentList(projectAgents, 'project')}
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      </section>
    </div>
  )
}
