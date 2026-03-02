import React from 'react'
import { SettingsHeader } from './SettingsHeader'
import { SettingsNav } from './SettingsNav'
import { useUIStore } from '../../stores/ui-store'
import { ScrollArea } from '../ui/ScrollArea'
import { GeneralSection } from './sections/GeneralSection'
import { SessionSection } from './sections/SessionSection'
import { EnvironmentSection } from './sections/EnvironmentSection'
import { ModelsSection } from './sections/ModelsSection'
import { PluginsSection } from './sections/PluginsSection'
import { AgentsSection } from './sections/AgentsSection'
import { McpServersSection } from './sections/McpServersSection'
import { HooksSection } from './sections/HooksSection'
import { MemorySection } from './sections/MemorySection'
import { UsageSection } from './sections/UsageSection'
import { StructuredOutputSection } from './sections/StructuredOutputSection'
import type { SettingsSection } from './types'

const SECTION_COMPONENTS: Record<SettingsSection, React.FC> = {
  general: GeneralSection,
  session: SessionSection,
  environment: EnvironmentSection,
  models: ModelsSection,
  'structured-output': StructuredOutputSection,
  plugins: PluginsSection,
  agents: AgentsSection,
  'mcp-servers': McpServersSection,
  hooks: HooksSection,
  memory: MemorySection,
  usage: UsageSection,
}

export const SettingsPage: React.FC = () => {
  const settingsSection = useUIStore(s => s.settingsSection)
  const setSettingsSection = useUIStore(s => s.setSettingsSection)

  const ActiveSection = SECTION_COMPONENTS[settingsSection]

  return (
    <div className="flex flex-col h-full">
      <SettingsHeader />
      <div className="flex-1 flex min-h-0">
        <SettingsNav activeSection={settingsSection} onSelect={setSettingsSection} />
        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto p-6">
            <ActiveSection />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
