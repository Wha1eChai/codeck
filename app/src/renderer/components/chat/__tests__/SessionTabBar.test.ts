// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useSessionStore } from '@renderer/stores/session-store'
import { useUIStore } from '@renderer/stores/ui-store'
import {
  resetAllStores,
  createMockElectron,
  createMockSessionTab,
  createMockSession,
} from '@renderer/__test-utils__'
import type { MockElectronAPI } from '@renderer/__test-utils__'
import { SessionTabBar } from '../SessionTabBar'

let mockElectron: MockElectronAPI

describe('SessionTabBar', () => {
  beforeEach(() => {
    resetAllStores()
    mockElectron = createMockElectron()
    ;(window as any).electron = mockElectron
  })

  afterEach(() => {
    delete (window as any).electron
  })

  it('returns null when no tabs are open', () => {
    const { container } = render(React.createElement(SessionTabBar))

    expect(container.innerHTML).toBe('')
  })

  it('renders tabs with their names', () => {
    useSessionStore.setState({
      openTabs: [
        createMockSessionTab({ sessionId: 's1', name: 'Alpha Session' }),
        createMockSessionTab({ sessionId: 's2', name: 'Beta Session' }),
      ],
      sessions: [
        createMockSession({ id: 's1', name: 'Alpha Session' }),
        createMockSession({ id: 's2', name: 'Beta Session' }),
      ],
    })

    const { container } = render(React.createElement(SessionTabBar))

    expect(container.textContent).toContain('Alpha Session')
    expect(container.textContent).toContain('Beta Session')
    expect(container.querySelector('[role="tablist"]')).toBeTruthy()
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2)
  })

  it('marks active tab with aria-selected="true"', () => {
    useSessionStore.setState({
      openTabs: [
        createMockSessionTab({ sessionId: 's1', name: 'Active Tab' }),
        createMockSessionTab({ sessionId: 's2', name: 'Inactive Tab' }),
      ],
      currentSessionId: 's1',
      sessions: [
        createMockSession({ id: 's1' }),
        createMockSession({ id: 's2' }),
      ],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('renders close button for each tab', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'My Tab' })],
      sessions: [createMockSession({ id: 's1', name: 'My Tab' })],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const closeBtn = container.querySelector('[aria-label="Close My Tab"]')
    expect(closeBtn).toBeTruthy()
  })

  it('calls closeSessionTab when close button is clicked', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'Tab' })],
      sessions: [createMockSession({ id: 's1' })],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const closeBtn = container.querySelector('[aria-label="Close Tab"]') as HTMLElement
    fireEvent.click(closeBtn)

    expect(mockElectron.closeSessionTab).toHaveBeenCalledWith('s1')
  })

  it('renders status dot with correct color for streaming tab', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'Streaming', status: 'streaming' })],
      sessions: [createMockSession({ id: 's1' })],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const dot = container.querySelector('.bg-green-500')
    expect(dot).toBeTruthy()
  })

  it('renders new session button', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'Tab' })],
      sessions: [createMockSession({ id: 's1' })],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const newBtn = container.querySelector('[title="New session"]')
    expect(newBtn).toBeTruthy()
  })

  it('renders pending interaction badge', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'Waiting' })],
      sessions: [createMockSession({ id: 's1' })],
    })
    useUIStore.setState({
      pendingInteractions: {
        s1: {
          kind: 'permission',
          requestId: 'req-1',
          title: 'Use Bash?',
          options: [{ label: 'Allow' }, { label: 'Deny' }],
          allowCustomInput: false,
          multiSelect: false,
        },
      },
    })

    const { container } = render(React.createElement(SessionTabBar))

    const badge = container.querySelector('.animate-pulse')
    expect(badge).toBeTruthy()
  })

  it('renders worktree icon when session has worktree', () => {
    useSessionStore.setState({
      openTabs: [createMockSessionTab({ sessionId: 's1', name: 'Worktree' })],
      sessions: [createMockSession({
        id: 's1',
        worktree: { path: '/tmp/wt', branchName: 'feature-1' },
      })],
    })

    const { container } = render(React.createElement(SessionTabBar))

    const branchSpan = container.querySelector('[title="feature-1"]')
    expect(branchSpan).toBeTruthy()
  })
})
