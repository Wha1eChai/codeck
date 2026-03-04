import React, { useMemo, useEffect } from 'react'
import { Message } from '@common/types'
import { useMessageStore } from '../../stores/message-store'
import { useSessionStore } from '../../stores/session-store'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { ChatInput } from './ChatInput'
import { InteractionPanel } from './InteractionPanel'
import { TokenBar } from './TokenBar'
import { WelcomeView } from './WelcomeView'
import { Sparkles, Bug, FileSearch, Code2 } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store'
import { reduceConversation } from '../../lib/conversation-reducer'
import { ConversationFlow } from './ConversationFlow'

const QUICK_ACTIONS = [
  {
    icon: Sparkles,
    title: 'Explain Code',
    desc: 'Analyze current file or selected code',
    prompt: 'Please explain how this code works and suggest improvements.'
  },
  {
    icon: Bug,
    title: 'Fix Bug',
    desc: 'Debug issues in current code',
    prompt: 'I found a bug in the current file. Please help me diagnose and fix it.'
  },
  {
    icon: FileSearch,
    title: 'Review Changes',
    desc: 'Inspect recent code modifications',
    prompt: 'Please review my recent code changes and call out potential issues.'
  },
  {
    icon: Code2,
    title: 'Refactor',
    desc: 'Improve structure and readability',
    prompt: 'I want to refactor this component to be more modular. What do you recommend?'
  }
]

const EMPTY_MESSAGES: Message[] = []

export const ChatContainer: React.FC = () => {
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const sessionStatus = useSessionStore(s => s.sessionStatus)
  const projectPath = useSessionStore(s => s.projectPath)
  const messages = useMessageStore(s => currentSessionId ? s.messages[currentSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  const { scrollRef, handleScroll } = useAutoScroll()
  const setDraftInput = useUIStore(s => s.setDraftInput)
  const pendingInteraction = useUIStore(s => s.pendingInteraction)
  const setChatScrollContainer = useUIStore(s => s.setChatScrollContainer)
  const groups = useMemo(() => reduceConversation(messages), [messages])

  // Register scroll container in ui-store so TimelinePanel can sync to it
  useEffect(() => {
    const el = scrollRef.current
    if (el) setChatScrollContainer(el)
    return () => setChatScrollContainer(null)
  }, [setChatScrollContainer]) // scrollRef.current is set before this effect runs

  const showEmptyState = !currentSessionId || (messages.length === 0 && sessionStatus === 'idle')
  const showWelcome = !currentSessionId && !projectPath

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-4 flex flex-col items-center"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className="w-full max-w-4xl flex flex-col" style={{ gap: 'var(--chat-gap)' }}>
          {showEmptyState ? (
            showWelcome ? (
              <WelcomeView />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-10 text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground tracking-tight">How can I help you today?</h2>
                  <p className="text-muted-foreground text-sm">I can help you write, debug, and understand code.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
                  {QUICK_ACTIONS.map(action => (
                    <button
                      key={action.title}
                      onClick={() => setDraftInput(action.prompt)}
                      className="group relative flex flex-col items-start gap-2 p-4 rounded-xl border border-border/40 bg-gradient-to-br from-card/80 to-muted/30 hover:from-muted/50 hover:to-muted/60 transition-all hover:shadow-lg hover:-translate-y-1 hover:border-primary/20 text-left"
                    >
                      <div className="p-2 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                        <action.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm">{action.title}</div>
                        <div className="text-xs text-muted-foreground-subtle mt-0.5">{action.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <p className="mt-6 text-xs text-muted-foreground-subtle">
                  Type <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/50 font-mono text-[11px]">/</kbd> for commands
                </p>
              </div>
            )
          ) : (
            <ConversationFlow groups={groups} sessionId={currentSessionId ?? undefined} />
          )}
        </div>
      </div>

      {/* Input Area — ChatInput or InteractionPanel */}
      <div className="shrink-0 z-10 flex justify-center">
        <div className="w-full max-w-4xl">
          {pendingInteraction ? <InteractionPanel /> : <ChatInput />}
          {currentSessionId && <TokenBar />}
        </div>
      </div>
    </div>
  )
}

