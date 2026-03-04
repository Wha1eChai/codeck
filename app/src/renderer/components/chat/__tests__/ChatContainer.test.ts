// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useSessionStore } from '@renderer/stores/session-store'
import { useMessageStore } from '@renderer/stores/message-store'
import { useUIStore } from '@renderer/stores/ui-store'
import {
  resetAllStores,
  createMockElectron,
  createMockMessage,
} from '@renderer/__test-utils__'
import type { MockElectronAPI } from '@renderer/__test-utils__'

// Mock child components that depend on Radix UI (incompatible with happy-dom)
vi.mock('../TokenBar', () => ({
  TokenBar: () => React.createElement('div', { 'data-testid': 'token-bar' }),
}))
vi.mock('../InputFooter', () => ({
  InputFooter: () => React.createElement('div', { 'data-testid': 'input-footer' }),
}))

const { ChatContainer } = await import('../ChatContainer')

let mockElectron: MockElectronAPI

describe('ChatContainer', () => {
  beforeEach(() => {
    resetAllStores()
    mockElectron = createMockElectron()
    ;(window as any).electron = mockElectron
  })

  afterEach(() => {
    delete (window as any).electron
  })

  it('renders WelcomeView when no session and no project', () => {
    const { container } = render(React.createElement(ChatContainer))

    // WelcomeView shows folder-open action
    expect(container.textContent).toContain('Open')
    expect(container.textContent).not.toContain('How can I help you today?')
  })

  it('renders quick actions empty state when session exists but no messages', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      projectPath: '/test/project',
      sessionStatus: 'idle',
    })

    const { container } = render(React.createElement(ChatContainer))

    expect(container.textContent).toContain('How can I help you today?')
    expect(container.textContent).toContain('Explain Code')
    expect(container.textContent).toContain('Fix Bug')
    expect(container.textContent).toContain('Review Changes')
    expect(container.textContent).toContain('Refactor')
  })

  it('renders ConversationFlow when session has messages', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      projectPath: '/test/project',
      sessionStatus: 'idle',
    })
    useMessageStore.setState({
      messages: {
        'sess-1': [
          createMockMessage({
            id: 'msg-1',
            sessionId: 'sess-1',
            role: 'user',
            content: 'Hello Claude',
          }),
        ],
      },
    })

    const { container } = render(React.createElement(ChatContainer))

    expect(container.textContent).toContain('Hello Claude')
    expect(container.textContent).not.toContain('How can I help you today?')
  })

  it('renders InteractionPanel when pendingInteraction exists', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      projectPath: '/test/project',
      sessionStatus: 'waiting_permission',
    })
    useUIStore.setState({
      pendingInteraction: {
        kind: 'permission',
        requestId: 'req-1',
        title: 'Use Bash?',
        description: 'echo hello',
        options: [
          { label: 'Allow', highlighted: true },
          { label: 'Deny' },
        ],
        allowCustomInput: false,
        multiSelect: false,
        risk: 'high',
        rememberLabel: 'Remember this session',
      },
    })

    const { container } = render(React.createElement(ChatContainer))

    expect(container.textContent).toContain('Use Bash?')
    expect(container.textContent).toContain('Allow')
    expect(container.textContent).toContain('Deny')
  })

  it('registers scroll container in ui-store', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      projectPath: '/test/project',
      sessionStatus: 'idle',
    })

    render(React.createElement(ChatContainer))

    // useEffect should have registered the scroll container
    const chatScrollContainer = useUIStore.getState().chatScrollContainer
    expect(chatScrollContainer).toBeInstanceOf(HTMLElement)
  })
})
