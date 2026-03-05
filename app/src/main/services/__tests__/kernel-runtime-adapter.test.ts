import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KernelRuntimeAdapter } from '../runtime/kernel-runtime-adapter'
import { KernelService } from '../runtime/kernel-service'
import type { SessionContext } from '../session-context'
import type { StartSessionParams } from '../claude'

// We test the adapter's delegation pattern and capabilities report.
// The actual KernelService is tested via agent-core's agent-loop tests.

function createMockSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: 'test-session',
    projectPath: '/tmp/project',
    abortController: null,
    permissionResolver: null,
    askUserQuestionResolver: null,
    exitPlanModeResolver: null,
    queryRef: null,
    sdkSessionId: null,
    sessionMetadata: null,
    permissionStore: null,
    ...overrides,
  }
}

describe('KernelRuntimeAdapter', () => {
  let adapter: KernelRuntimeAdapter
  let kernelService: KernelService

  beforeEach(() => {
    kernelService = new KernelService()
    adapter = new KernelRuntimeAdapter(kernelService)
  })

  it('has id "kernel"', () => {
    expect(adapter.id).toBe('kernel')
  })

  describe('getCapabilities', () => {
    it('reports correct capabilities', () => {
      const caps = adapter.getCapabilities()
      expect(caps.runtime).toBe('kernel')
      expect(caps.supports.permissionPrompt).toBe(true)
      expect(caps.supports.streamDelta).toBe(true)
      expect(caps.supports.modelSelection).toBe(true)
      // Not yet supported
      expect(caps.supports.resume).toBe(false)
      expect(caps.supports.checkpointing).toBe(false)
      expect(caps.supports.hooks).toBe(false)
    })

    it('reports supported permission modes', () => {
      const caps = adapter.getCapabilities()
      expect(caps.supportedPermissionModes).toContain('default')
      expect(caps.supportedPermissionModes).toContain('dontAsk')
    })
  })

  describe('abort', () => {
    it('delegates to KernelService.abort', () => {
      const abortSpy = vi.spyOn(kernelService, 'abort')
      const ctx = createMockSessionContext()
      adapter.abort(ctx)
      expect(abortSpy).toHaveBeenCalledWith(ctx)
    })
  })

  describe('resolvePermission', () => {
    it('delegates to KernelService.resolvePermission', () => {
      const resolveSpy = vi.spyOn(kernelService, 'resolvePermission')
      const ctx = createMockSessionContext()
      const response = { requestId: 'r1', allowed: true }
      adapter.resolvePermission(ctx, response)
      expect(resolveSpy).toHaveBeenCalledWith(ctx, response)
    })
  })

  describe('rewindFiles', () => {
    it('returns not supported', async () => {
      const ctx = createMockSessionContext()
      const result = await adapter.rewindFiles(ctx, 'msg-1')
      expect(result.canRewind).toBe(false)
      expect(result.error).toContain('not supported')
    })
  })

  describe('resolveAskUserQuestion', () => {
    it('does not throw (no-op)', () => {
      const ctx = createMockSessionContext()
      expect(() => {
        adapter.resolveAskUserQuestion(ctx, { requestId: 'r1', answers: {}, cancelled: false })
      }).not.toThrow()
    })
  })

  describe('resolveExitPlanMode', () => {
    it('does not throw (no-op)', () => {
      const ctx = createMockSessionContext()
      expect(() => {
        adapter.resolveExitPlanMode(ctx, { requestId: 'r1', allowed: true })
      }).not.toThrow()
    })
  })
})
