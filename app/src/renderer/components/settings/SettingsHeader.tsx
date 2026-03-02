import React, { useState, useEffect } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '../ui/Button'
import { useUIStore } from '../../stores/ui-store'
import { useSettingsStore } from '../../stores/settings-store'

export const SettingsHeader: React.FC = () => {
  const setActiveView = useUIStore(s => s.setActiveView)
  const lastSaved = useSettingsStore(s => s.lastSaved)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (lastSaved > 0) {
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [lastSaved])

  return (
    <div className="h-14 border-b border-border/40 flex items-center gap-3 px-6 bg-background/95 backdrop-blur shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setActiveView('chat')}
        title="Back to Chat"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h1 className="font-semibold text-lg">Settings</h1>
      {showSaved && (
        <span className="flex items-center gap-1 text-xs text-green-500 animate-in fade-in slide-in-from-right-2 duration-200">
          <Check className="h-3 w-3" />
          Saved
        </span>
      )}
    </div>
  )
}
