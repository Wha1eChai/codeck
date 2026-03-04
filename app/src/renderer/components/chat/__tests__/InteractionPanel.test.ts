// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useSessionStore } from '@renderer/stores/session-store'
import { useUIStore } from '@renderer/stores/ui-store'
import type { PendingInteraction } from '@renderer/stores/ui-store'
import {
  resetAllStores,
  createMockElectron,
} from '@renderer/__test-utils__'
import type { MockElectronAPI } from '@renderer/__test-utils__'
import { InteractionPanel } from '../InteractionPanel'

function makePermissionInteraction(overrides?: Partial<PendingInteraction>): PendingInteraction {
  return {
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
    rememberLabel: 'Remember: allow this exact Bash input this session',
    ...overrides,
  }
}

function makeAskUserQuestionInteraction(overrides?: Partial<PendingInteraction>): PendingInteraction {
  return {
    kind: 'askUserQuestion',
    requestId: 'ask-1',
    title: 'Choose a framework',
    description: 'Which framework do you want?',
    options: [
      { label: 'React' },
      { label: 'Vue' },
      { label: 'Svelte' },
    ],
    allowCustomInput: false,
    multiSelect: false,
    questionIndex: 0,
    totalQuestions: 1,
    allQuestions: [
      { question: 'Which framework?', header: 'Framework', options: [] },
    ],
    ...overrides,
  }
}

let mockElectron: MockElectronAPI

describe('InteractionPanel', () => {
  beforeEach(() => {
    resetAllStores()
    mockElectron = createMockElectron()
    ;(window as any).electron = mockElectron
    useSessionStore.setState({ currentSessionId: 'sess-1' })
  })

  afterEach(() => {
    delete (window as any).electron
  })

  it('returns null when no pending interaction', () => {
    useUIStore.setState({ pendingInteraction: null })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.innerHTML).toBe('')
  })

  it('renders permission request with Allow and Deny buttons', () => {
    useUIStore.setState({ pendingInteraction: makePermissionInteraction() })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.textContent).toContain('Use Bash?')
    expect(container.textContent).toContain('echo hello')
    expect(container.textContent).toContain('Allow')
    expect(container.textContent).toContain('Deny')
  })

  it('renders remember checkbox for permission kind', () => {
    useUIStore.setState({ pendingInteraction: makePermissionInteraction() })

    const { container } = render(React.createElement(InteractionPanel))

    const checkbox = container.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    expect(container.textContent).toContain('Remember')
  })

  it('renders risk color for high risk permission', () => {
    useUIStore.setState({
      pendingInteraction: makePermissionInteraction({ risk: 'high' }),
    })

    const { container } = render(React.createElement(InteractionPanel))

    const redIcon = container.querySelector('.text-red-500')
    expect(redIcon).toBeTruthy()
  })

  it('calls respondPermission when Allow is clicked', async () => {
    useUIStore.setState({ pendingInteraction: makePermissionInteraction() })

    const { container } = render(React.createElement(InteractionPanel))

    // Find the Allow button (first option button)
    const buttons = container.querySelectorAll('button')
    const allowBtn = Array.from(buttons).find(b => b.textContent?.includes('Allow'))
    expect(allowBtn).toBeTruthy()
    fireEvent.click(allowBtn!)

    expect(mockElectron.respondPermission).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-1', allowed: true }),
    )
  })

  it('renders AskUserQuestion with question title and options', () => {
    useUIStore.setState({
      pendingInteraction: makeAskUserQuestionInteraction(),
    })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.textContent).toContain('Choose a framework')
    expect(container.textContent).toContain('Which framework do you want?')
    expect(container.textContent).toContain('React')
    expect(container.textContent).toContain('Vue')
    expect(container.textContent).toContain('Svelte')
  })

  it('renders question step counter for multi-step AskUserQuestion', () => {
    useUIStore.setState({
      pendingInteraction: makeAskUserQuestionInteraction({
        questionIndex: 0,
        totalQuestions: 3,
      }),
    })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.textContent).toContain('1/3')
  })

  it('renders exitPlanMode options', () => {
    useUIStore.setState({
      pendingInteraction: {
        kind: 'exitPlanMode',
        requestId: 'plan-1',
        title: 'Exit Plan Mode',
        description: 'Claude has completed planning.',
        options: [
          { label: 'Compact & Execute', highlighted: true },
          { label: 'Auto-accept edits' },
          { label: 'Approve manually' },
          { label: 'Keep planning' },
        ],
        allowCustomInput: false,
        multiSelect: false,
      },
    })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.textContent).toContain('Exit Plan Mode')
    expect(container.textContent).toContain('Compact & Execute')
    expect(container.textContent).toContain('Auto-accept edits')
    expect(container.textContent).toContain('Approve manually')
    expect(container.textContent).toContain('Keep planning')
  })

  it('renders cancel button with Esc hint', () => {
    useUIStore.setState({ pendingInteraction: makePermissionInteraction() })

    const { container } = render(React.createElement(InteractionPanel))

    const cancelBtn = container.querySelector('[title="Cancel (Esc)"]')
    expect(cancelBtn).toBeTruthy()
  })

  it('renders keyboard hint for options', () => {
    useUIStore.setState({ pendingInteraction: makePermissionInteraction() })

    const { container } = render(React.createElement(InteractionPanel))

    expect(container.textContent).toContain('Press 1/2 to select')
    expect(container.textContent).toContain('Esc to cancel')
  })
})
