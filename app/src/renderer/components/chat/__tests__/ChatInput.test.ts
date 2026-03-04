// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useSessionStore } from '@renderer/stores/session-store'
import {
  resetAllStores,
  createMockElectron,
} from '@renderer/__test-utils__'
import type { MockElectronAPI } from '@renderer/__test-utils__'

// Mock InputFooter which uses Radix UI Select (incompatible with happy-dom)
vi.mock('../InputFooter', () => ({
  InputFooter: () => React.createElement('div', { 'data-testid': 'input-footer' }),
}))

const { ChatInput } = await import('../ChatInput')

let mockElectron: MockElectronAPI

describe('ChatInput', () => {
  beforeEach(() => {
    resetAllStores()
    mockElectron = createMockElectron()
    ;(window as any).electron = mockElectron
  })

  afterEach(() => {
    delete (window as any).electron
  })

  it('renders textarea with placeholder', () => {
    const { container } = render(React.createElement(ChatInput))

    const textarea = container.querySelector('textarea[data-chat-input]')
    expect(textarea).toBeTruthy()
    expect(textarea?.getAttribute('placeholder')).toContain('Message Claude')
  })

  it('send button is disabled when input is empty', () => {
    const { container } = render(React.createElement(ChatInput))

    // The send button (non-streaming mode) should be disabled
    const sendButton = container.querySelector('button[disabled]')
    expect(sendButton).toBeTruthy()
  })

  it('renders stop button when streaming', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'streaming',
    })

    const { container } = render(React.createElement(ChatInput))

    const stopButton = container.querySelector('button[title="Stop generating"]')
    expect(stopButton).toBeTruthy()
  })

  it('disables textarea when streaming', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'streaming',
    })

    const { container } = render(React.createElement(ChatInput))

    const textarea = container.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
  })

  it('disables textarea when waiting for permission', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'waiting_permission',
    })

    const { container } = render(React.createElement(ChatInput))

    const textarea = container.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)
  })

  it('Shift+Enter does not trigger submit', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'idle',
    })

    const { container } = render(React.createElement(ChatInput))
    const textarea = container.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'Hello world' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    // Shift+Enter should NOT call sendMessage — input stays
    expect(mockElectron.sendMessage).not.toHaveBeenCalled()
  })

  it('empty input does not trigger submit on Enter', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'idle',
    })

    const { container } = render(React.createElement(ChatInput))
    const textarea = container.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement

    // Leave input empty, press Enter
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockElectron.sendMessage).not.toHaveBeenCalled()
  })

  it('shows streaming placeholder text when streaming', () => {
    useSessionStore.setState({
      currentSessionId: 'sess-1',
      sessionStatus: 'streaming',
    })

    const { container } = render(React.createElement(ChatInput))

    const textarea = container.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement
    expect(textarea.getAttribute('placeholder')).toContain('Claude is thinking')
  })
})
