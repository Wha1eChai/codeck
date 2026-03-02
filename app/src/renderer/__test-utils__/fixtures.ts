// ============================================================
// Test Fixtures — 类型安全的 mock 数据工厂
// ============================================================

import type { Session, Message, SessionStatus } from '@common/types'
import type { ActiveSessionState, SessionTab } from '@common/multi-session-types'

let counter = 0

function nextId(): string {
  return `test-${++counter}`
}

/**
 * Reset the internal counter (call in beforeEach if needed for deterministic IDs).
 */
export function resetFixtureCounter(): void {
  counter = 0
}

export function createMockSession(overrides?: Partial<Session>): Session {
  const id = overrides?.id ?? nextId()
  return {
    id,
    name: `Session ${id}`,
    projectPath: '/test/project',
    runtime: 'claude',
    permissionMode: 'default',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function createMockMessage(overrides?: Partial<Message>): Message {
  return {
    id: overrides?.id ?? nextId(),
    sessionId: 'session-1',
    role: 'assistant',
    type: 'text',
    content: 'Test message',
    timestamp: Date.now(),
    ...overrides,
  }
}

export function createMockActiveSessionState(overrides?: Partial<ActiveSessionState>): ActiveSessionState {
  return {
    sessionId: overrides?.sessionId ?? nextId(),
    projectPath: '/test/project',
    sdkSessionId: null,
    status: 'idle' as SessionStatus,
    error: null,
    ...overrides,
  }
}

export function createMockSessionTab(overrides?: Partial<SessionTab>): SessionTab {
  const sessionId = overrides?.sessionId ?? nextId()
  return {
    sessionId,
    name: `Tab ${sessionId}`,
    status: 'idle' as SessionStatus,
    ...overrides,
  }
}
