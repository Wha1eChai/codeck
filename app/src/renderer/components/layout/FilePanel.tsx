import React from 'react'
import { useSessionStore } from '../../stores/session-store'
import { FileExplorer } from '../explorer/FileExplorer'

export const FilePanel: React.FC = () => {
  const projectPath = useSessionStore(s => s.projectPath)
  const projectName = projectPath
    ? projectPath.split(/[/\\]/).filter(Boolean).pop() ?? projectPath
    : null

  return (
    <div className="w-[220px] bg-muted/10 flex flex-col h-full border-r shrink-0">
      <div className="p-3 border-b">
        <h2 className="font-semibold text-sm tracking-tight">Files</h2>
        {projectName && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={projectPath ?? undefined}>
            {projectName}
          </p>
        )}
      </div>
      <FileExplorer />
    </div>
  )
}
