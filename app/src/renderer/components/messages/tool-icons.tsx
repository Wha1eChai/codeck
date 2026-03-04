import React from 'react'
import { FileText, Terminal, Search, Globe, Zap, Wrench } from 'lucide-react'

const ICON_CLASS = 'h-3.5 w-3.5'

export function getToolIcon(toolName: string): React.ReactNode {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return <FileText className={ICON_CLASS} />
    case 'Bash':
      return <Terminal className={ICON_CLASS} />
    case 'Grep':
    case 'Glob':
      return <Search className={ICON_CLASS} />
    case 'WebSearch':
    case 'WebFetch':
      return <Globe className={ICON_CLASS} />
    case 'Skill':
      return <Zap className={ICON_CLASS} />
    default:
      return <Wrench className={ICON_CLASS} />
  }
}
