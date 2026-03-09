# Current Phase: M1 — Kernel Viability (Phase 5B Part 2)

> Target: 8 weeks from 2026-03-09
> Predecessor: Phase 5B Part 1 (completed — kernel basics functional)
> Goal: Make kernel runtime a credible daily-driver for basic workflows

---

## Overview

The self-hosted kernel (`@codeck/agent-core` + `@codeck/provider`) now supports:
- Start new sessions with streaming
- Execute 6 core tools (Bash, Read, Write, Edit, Glob, Grep)
- Handle permission prompts via IPC
- Select models (sonnet/opus/haiku) with API Key / Base URL config
- **Resume sessions** via transcript reconstruction (`transcript-to-core-messages.ts`)
- **Plan mode** with ExitPlanMode approval gate
- **MCP server connection** (stdio transport, auto-connect from `~/.claude/.claude.json`)
- **AskUserQuestion / ExitPlanMode** IPC flows
- **Runtime truthfulness** — unavailable runtimes disabled in UI + preferences validation

Remaining gaps (not in M1 scope):
- Checkpointing / rewind
- Hooks integration
- Native file history

**WS-1 through WS-5 are complete.** This phase now focuses on WS-6 (integration tests).

---

## Work Streams

### WS-1: Runtime Truthfulness Fix (Quick Win) — COMPLETE

> Status: ✅ Done (commit 8054e8f, refined in 951fd00)

**Implemented:**
- [x] `RUNTIME_CATALOG` in `app/src/common/runtime-catalog.ts` — shared catalog with `available` flag
- [x] `isRuntimeAvailable()` derives from catalog via Set (not hardcoded)
- [x] `GeneralSection.tsx` uses catalog, disables unavailable runtimes
- [x] `app-preferences.ts` `sanitise()` validates against `isRuntimeAvailable()`
- [x] Codex/OpenCode show as grayed-out "Coming Soon"

---

### WS-2: Kernel Transcript Canonicalization — COMPLETE

> Status: ✅ Done (commit 8054e8f)

**Implemented:**
- [x] `session_meta` header written via `persistDraftSession()` before first user message
- [x] `session_runtime` metadata written via `persistRuntimeMetadata()` on `onMetadata` callback
- [x] Kernel sessions recognized by `listSessions()` as `runtime: "kernel"`
- [x] No new writer in `@codeck/agent-core` — reuses existing `ClaudeFilesService` path
- [x] `session-parser.ts` extracts metadata from both `session_meta` and `session_runtime` records

---

### WS-3: Session Resume for Kernel — COMPLETE

> Status: ✅ Done (commit 8054e8f)

**Implemented:**
- [x] `transcript-to-core-messages.ts` reconstructs `CoreLikeMessage[]` from flat `Message[]`
- [x] `loadResumeMessages()` in `kernel-service.ts` checks metadata.runtime === 'kernel', reads transcript
- [x] Resume calls `runAgentLoop(resumeMessages, options)` instead of `startAgentLoop(prompt, options)`
- [x] Orchestrator persists new user message before calling `startSession()`, so resume transcript is complete
- [x] `KERNEL_CAPABILITIES.supports.resume = true`
- [x] Unit tests cover compaction and tool-call reconstruction

**Known limitations (acceptable for M1):**
- Thinking messages are dropped during reconstruction (correct — API doesn't accept them back)
- `planApproved` resets on resume (closure variable; acceptable since plan gate re-prompts)

---

### WS-4: Plan Mode for Kernel — COMPLETE

> Status: ✅ Done (commit 8054e8f)

**Implemented:**
- [x] `system-prompt.ts` appends `<plan-mode>` instructions when `permissionMode === 'plan'`
- [x] Plan gate decorator wraps base permission gate in `kernel-service.ts`
- [x] First tool call triggers `ExitPlanModeRequest` IPC; user approves → `planApproved = true`
- [x] Rejection returns reason to model as tool result context
- [x] `supportedPermissionModes` includes `'plan'`
- [x] `resolveExitPlanMode()` delegates from adapter to KernelService

---

### WS-5: MCP Server Integration for Kernel — COMPLETE

> Status: ✅ Done (commit 8054e8f, hardened in 951fd00)

**Implemented:**
- [x] `packages/agent-core/src/mcp/client.ts` — stdio transport via `@modelcontextprotocol/sdk`
- [x] `packages/agent-core/src/mcp/mcp-tool-bridge.ts` — JSON Schema → Zod + `ToolDefinition[]`
- [x] `kernel-service.ts` `connectMcpTools()` — reads `~/.claude/.claude.json`, auto-connects
- [x] MCP connections cleaned up in `finally` block on session end/abort
- [x] Name collision handled: duplicate tool names prefixed as `${serverName}.${toolName}`
- [x] Each server connection isolated with try/catch (one bad server doesn't block session)

---

### WS-6: Integration Tests — COMPLETE

> Status: ✅ Done

**Implemented:**
- [x] `kernel-runtime.test.ts` — 6 scenarios (basic conversation, tool execution, permission, resume, abort, model resolution)
- [x] `multi-session-kernel.test.ts` — 2 scenarios (concurrent independence, abort isolation)
- [x] All 8 tests passing against real API (via Anthropic-compatible proxy)
- [x] Tests support env var overrides: `ANTHROPIC_BASE_URL`, `INTEGRATION_TEST_MODEL`
- [x] `vitest.integration.config.ts` has workspace package aliases

---

## Execution Status

```
WS-1: ✅ Complete (runtime truthfulness)
WS-2: ✅ Complete (transcript canonicalization)
WS-3: ✅ Complete (session resume)
WS-4: ✅ Complete (plan mode)
WS-5: ✅ Complete (MCP integration)
WS-6: ✅ Complete (integration tests — 8/8 passing)
```

---

## Codex Execution Notes

When delegating tasks to Codex, provide these context files:

**Always include:**
- `CLAUDE.md` (project conventions and architecture)
- `docs/plans/CURRENT-PHASE.md` (this file — scope and acceptance criteria)
- The specific task's target file(s)

**For kernel work (WS-2, WS-3, WS-4, WS-5):**
- `packages/agent-core/src/loop/agent-loop.ts` — understand the loop
- `packages/agent-core/src/loop/types.ts` — AgentEvent types
- `app/src/main/services/runtime/kernel-service.ts` — orchestration
- `app/src/main/services/runtime/kernel-runtime-adapter.ts` — capability report

**For UI work (WS-1):**
- `app/src/renderer/components/settings/sections/GeneralSection.tsx`
- `app/src/common/types/execution.ts` — RuntimeProvider type
- `app/src/main/services/app-preferences.ts` — preference validation

**For integration tests (WS-6):**
- `app/src/__integration__/` — existing integration test patterns
- `app/vitest.config.ts` — test configuration

**Task sizing for Codex:**
Each numbered task (e.g., "Task 2.1") is designed to be a single Codex session.
Tasks within a work stream should be executed sequentially.
Tasks across independent work streams can run in parallel.

---

## Definition of Done (M1 Complete)

- [x] All WS-1 through WS-6 tasks completed
- [x] All WS-6 integration tests pass (8/8)
- [x] `KERNEL_CAPABILITIES` report updated to reflect new capabilities
- [x] `pnpm test` passes (938 unit tests across all packages)
- [x] `pnpm --filter codeck typecheck` passes
- [x] CLAUDE.md updated with kernel conventions and gotchas
- [x] ROADMAP.md M1 status updated to "Complete"
