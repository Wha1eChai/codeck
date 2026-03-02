import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Button } from '../ui/Button'
import { useClaude } from '../../hooks/useClaude'
import { useSessionActions } from '../../hooks/useSessionActions'
import { useSessionStore } from '../../stores/session-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useUIStore } from '../../stores/ui-store'
import { Square, SendHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'
import { InputFooter } from './InputFooter'

// ── Streaming Status Verbs ──

const STREAMING_VERBS = [
  'Thinking...', 'Pondering...', 'Crafting...', 'Brewing...',
  'Analyzing...', 'Composing...', 'Reasoning...', 'Exploring...',
  'Weaving...', 'Conjuring...', 'Deliberating...', 'Assembling...',
] as const

// ── Slash Commands ──

interface SlashCommand {
  readonly command: string
  readonly description: string
}

const SLASH_COMMANDS: readonly SlashCommand[] = [
  { command: '/compact', description: '压缩当前会话上下文以节省 token' },
]

export const ChatInput: React.FC = () => {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Quick Action Draft Handler
  const draftInput = useUIStore(s => s.draftInput)
  const setDraftInput = useUIStore(s => s.setDraftInput)

  useEffect(() => {
    if (draftInput) {
      setInput(draftInput)
      setDraftInput('')
      textareaRef.current?.focus()
    }
  }, [draftInput, setDraftInput])
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)

  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const updateSession = useSessionStore(s => s.updateSession)
  const executionOptions = useSettingsStore(s => s.executionOptions)
  const hookSettings = useSettingsStore(s => s.hookSettings)
  const { sendMessage, abort } = useClaude(currentSessionId)
  const { quickCreateSession } = useSessionActions()

  const isStreaming = sessionStatus === 'streaming'
  const isWaitingPermission = sessionStatus === 'waiting_permission'
  const isBusy = isStreaming || isWaitingPermission

  // Creative streaming status verb — pick once per streaming session
  const streamingVerbRef = useRef<string>(STREAMING_VERBS[0])
  useEffect(() => {
    if (isStreaming) {
      streamingVerbRef.current = STREAMING_VERBS[Math.floor(Math.random() * STREAMING_VERBS.length)]
    }
  }, [isStreaming])

  const statusText = isWaitingPermission
    ? 'Waiting for permission'
    : isStreaming ? streamingVerbRef.current : 'Ready'

  // Filter slash commands based on current input
  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return []
    const query = input.toLowerCase()
    return SLASH_COMMANDS.filter(c => c.command.startsWith(query))
  }, [input])

  // Show/hide slash menu
  useEffect(() => {
    setShowSlashMenu(filteredCommands.length > 0 && input.startsWith('/') && !input.includes(' '))
    setSlashIndex(0)
  }, [filteredCommands, input])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const currentSession = useSessionStore(s =>
    currentSessionId ? s.sessions.find(sess => sess.id === currentSessionId) : undefined
  )

  const selectSlashCommand = (cmd: SlashCommand) => {
    setInput(cmd.command)
    setShowSlashMenu(false)
    textareaRef.current?.focus()
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isBusy) return

    const content = input
    setInput('')
    setShowSlashMenu(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Auto-create session if none exists
    let sessionId = currentSessionId
    let session = currentSession
    if (!sessionId) {
      const created = await quickCreateSession()
      if (!created) return
      sessionId = created.id
      session = created
    }

    // Auto-rename "New Session" to first message content
    if (session?.name === 'New Session') {
      updateSession(sessionId, { name: content.slice(0, 50) })
    }

    // Pass executionOptions and hookSettings from settings store
    const hasExecOptions = Object.values(executionOptions).some(v => v !== undefined)
    const hasHookSettings = hookSettings.autoAllowReadOnly || hookSettings.blockedCommands.length > 0
    await sendMessage(
      content,
      session?.permissionMode,
      hasExecOptions ? executionOptions : undefined,
      hasHookSettings ? hookSettings : undefined,
    )
  }

  const [pasteWarning, setPasteWarning] = useState(false)

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    // Check if paste contains non-text content (images, files)
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        e.preventDefault()
        setPasteWarning(true)
        setTimeout(() => setPasteWarning(false), 2000)
        return
      }
    }
    // Plain text paste: let default behavior proceed; auto-resize triggers via input state
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME composing guard: prevent Enter from triggering actions during CJK input
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(i => Math.min(i + 1, filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        if (filteredCommands[slashIndex]) {
          selectSlashCommand(filteredCommands[slashIndex])
        }
        return
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }

  }

  return (
    <div className="px-4 pb-4 bg-transparent">
      <div className={cn(
        "relative flex flex-col border rounded-xl shadow-lg transition-all duration-200 bg-background",
        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
        "dark:focus-within:ring-accent/30 dark:focus-within:border-accent/50 dark:focus-within:shadow-[0_0_12px_-2px_hsl(18_72%_50%/0.25)]"
      )}>
        <div className="flex items-end gap-2 p-3">
          {/* Slash command dropdown */}
          {showSlashMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.command}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors ${i === slashIndex ? 'bg-accent' : ''
                    }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectSlashCommand(cmd)
                  }}
                >
                  <span className="font-mono font-medium text-primary">{cmd.command}</span>
                  <span className="ml-2 text-muted-foreground">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            data-chat-input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={pasteWarning ? "Image/file paste not yet supported" : isStreaming ? "Claude is thinking..." : "Message Claude... (type / for commands)"}
            className="flex-1 max-h-[300px] min-h-[40px] bg-transparent border-0 resize-none focus:ring-0 focus:outline-none py-2 px-1 text-sm leading-relaxed placeholder:text-muted-foreground/50"
            rows={1}
            disabled={isBusy}
          />

          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 shrink-0 rounded-lg mb-1"
              onClick={abort}
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg mb-1 transition-transform active:scale-95"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isBusy}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>

        <InputFooter isStreaming={isStreaming} statusText={statusText} charCount={input.length} />
      </div>
    </div>
  )
}
