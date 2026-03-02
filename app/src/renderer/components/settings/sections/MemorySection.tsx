import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '../../ui/Button'
import { Textarea } from '../../ui/Textarea'
import { BookOpen, Loader2, Save, User, Folder, Brain, FileText } from 'lucide-react'
import { SectionHeader, SettingsCard, StorageHint } from '../SettingsCard'
import { ScrollArea } from '../../ui/ScrollArea'
import { cn } from '../../../lib/utils'
import type { MemoryFile } from '@common/types'

const SCOPE_ICONS: Record<MemoryFile['scope'], React.ReactNode> = {
  'user-global': <User className="h-3 w-3" />,
  project: <Folder className="h-3 w-3" />,
  'project-memory': <Brain className="h-3 w-3" />,
}

const SCOPE_LABELS: Record<MemoryFile['scope'], string> = {
  'user-global': 'User Global',
  project: 'Project',
  'project-memory': 'Auto Memory',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const MemorySection: React.FC = () => {
  const [files, setFiles] = useState<readonly MemoryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadFiles = useCallback(async () => {
    try {
      const result = await window.electron.getMemoryFiles()
      setFiles(result)
    } catch {
      // Failed to load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleSelectFile = async (file: MemoryFile) => {
    setSelectedFile(file)
    setContentLoading(true)
    try {
      const text = await window.electron.getMemoryContent(file.path)
      setContent(text)
      setOriginalContent(text)
    } catch {
      setContent('Failed to load file content.')
      setOriginalContent('')
    } finally {
      setContentLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      await window.electron.updateMemoryContent(selectedFile.path, content)
      setOriginalContent(content)
    } catch (err) {
      console.error('Failed to save memory file:', err)
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== originalContent

  // Group files by scope
  const grouped = new Map<MemoryFile['scope'], MemoryFile[]>()
  for (const file of files) {
    const list = grouped.get(file.scope) ?? []
    list.push(file)
    grouped.set(file.scope, list)
  }

  return (
    <div className="space-y-6">
      <StorageHint text="CLAUDE.md and auto-memory files" />

      <section className="space-y-3">
        <SectionHeader icon={BookOpen} title="Memory Files" />

        {loading ? (
          <SettingsCard>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </SettingsCard>
        ) : files.length === 0 ? (
          <SettingsCard>
            <div className="text-center py-8">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No memory files found.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create CLAUDE.md files to configure project memory.
              </p>
            </div>
          </SettingsCard>
        ) : (
          <div className="flex gap-4 min-h-[400px]">
            {/* File list */}
            <SettingsCard className="w-[220px] shrink-0 p-2">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {Array.from(grouped.entries()).map(([scope, scopeFiles]) => (
                    <div key={scope}>
                      <div className="flex items-center gap-1.5 px-2 mb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        {SCOPE_ICONS[scope]} {SCOPE_LABELS[scope]}
                      </div>
                      <div className="space-y-0.5">
                        {scopeFiles.map((file) => (
                          <button
                            key={file.path}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                              selectedFile?.path === file.path
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                            )}
                            onClick={() => handleSelectFile(file)}
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{file.name}</div>
                              {file.sizeBytes != null && (
                                <div className="text-[10px] text-muted-foreground/50">
                                  {formatSize(file.sizeBytes)}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SettingsCard>

            {/* Editor */}
            <SettingsCard className="flex-1 flex flex-col p-3">
              {!selectedFile ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Select a file to edit
                </div>
              ) : contentLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {selectedFile.name}
                    </span>
                    <Button
                      size="sm"
                      disabled={!isDirty || saving}
                      onClick={handleSave}
                      className="h-7"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="flex-1 min-h-[350px] font-mono text-xs bg-background resize-none"
                    placeholder="File content..."
                  />
                </>
              )}
            </SettingsCard>
          </div>
        )}
      </section>
    </div>
  )
}
