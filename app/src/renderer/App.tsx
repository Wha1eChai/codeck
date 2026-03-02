import { MainLayout } from './components/layout/MainLayout'
import { ProjectSelector } from './components/dialogs/ProjectSelector'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppInit } from './hooks/useAppInit'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useClaudeEvents } from './hooks/useClaude'

export function App() {
  useAppInit()
  useClaudeEvents()
  useKeyboardShortcuts()

  return (
    <ErrorBoundary>
      <div className="font-sans antialiased h-screen w-screen bg-background text-foreground overflow-hidden">
        <MainLayout />

        {/* Global Dialogs */}
        <ProjectSelector />
      </div>
    </ErrorBoundary>
  )
}
