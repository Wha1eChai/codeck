import React from 'react'
import { FolderOpen, History } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store'
import { useSessionStore } from '../../stores/session-store'
import { useHistory } from '../../hooks/useHistory'
import { useToastStore } from '../../stores/toast-store'

export const WelcomeView: React.FC = () => {
  const setActiveSidebarPanel = useUIStore(s => s.setActiveSidebarPanel)
  const setProjectPath = useSessionStore(s => s.setProjectPath)
  const setSessions = useSessionStore(s => s.setSessions)
  const addToast = useToastStore(s => s.addToast)
  const { syncAndLoad } = useHistory()

  const handleOpenFolder = async () => {
    try {
      const dir = await window.electron.selectDirectory()
      if (dir) {
        setProjectPath(dir)
        await window.electron.notifyProjectSelected(dir)
        const sessions = await window.electron.getSessions(dir)
        setSessions([...sessions])
        setActiveSidebarPanel('sessions')
      }
    } catch {
      addToast('Failed to open folder', 'error')
    }
  }

  const handleBrowseHistory = () => {
    setActiveSidebarPanel('history')
    syncAndLoad()
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 text-center space-y-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Welcome to Codeck</h2>
        <p className="text-muted-foreground text-sm">Claude Code Desktop Client</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          onClick={handleOpenFolder}
          className="group flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-gradient-to-br from-card/80 to-muted/30 hover:from-muted/50 hover:to-muted/60 transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/20 text-left"
        >
          <div className="p-2.5 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 group-hover:scale-110 transition-all">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium text-foreground text-sm">Open a Project</div>
            <div className="text-xs text-muted-foreground-subtle mt-0.5">Start coding in your project directory</div>
          </div>
        </button>

        <button
          onClick={handleBrowseHistory}
          className="group flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-gradient-to-br from-card/80 to-muted/30 hover:from-muted/50 hover:to-muted/60 transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/20 text-left"
        >
          <div className="p-2.5 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 group-hover:scale-110 transition-all">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="font-medium text-foreground text-sm">Browse History</div>
            <div className="text-xs text-muted-foreground-subtle mt-0.5">Continue a previous session</div>
          </div>
        </button>
      </div>
    </div>
  )
}
