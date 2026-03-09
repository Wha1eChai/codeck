# Current Phase: M1 — Kernel Viability (Phase 5B Part 2)

> Target: 8 weeks from 2026-03-09
> Predecessor: Phase 5B Part 1 (completed — kernel basics functional)
> Goal: Make kernel runtime a credible daily-driver for basic workflows

---

## Overview

The self-hosted kernel (`@codeck/agent-core` + `@codeck/provider`) can currently:
- Start new sessions with streaming
- Execute 6 core tools (Bash, Read, Write, Edit, Glob, Grep)
- Handle permission prompts via IPC
- Select models (sonnet/opus/haiku) with API Key / Base URL config

It cannot:
- Resume sessions (conversation is lost on app restart)
- Run in plan mode
- Connect to MCP servers or use skills
- Respond to AskUserQuestion / ExitPlanMode flows
- Checkpoint or rewind

This plan closes the most critical gaps in priority order.

---

## Work Streams

### WS-1: Runtime Truthfulness Fix (Quick Win)

> Priority: Immediate — this is a user-facing bug today
> Effort: ~2 hours
> Dependencies: None

**Problem:**
`GeneralSection.tsx` exposes 4 runtime options (claude, kernel, codex, opencode) but only
claude and kernel are registered in `setup.ts`. Selecting codex/opencode causes a silent
error when starting a session (`assertRuntimeRegistered()` throws).

**Tasks:**

#### Task 1.1: Disable unregistered runtimes in settings UI

**File:** `app/src/renderer/components/settings/sections/GeneralSection.tsx`

**Change:** Add `disabled` property to `RUNTIME_OPTIONS` and gate on registered runtimes.

```typescript
// Before:
const RUNTIME_OPTIONS: { value: RuntimeProvider; label: string }[] = [
    { value: 'claude', label: 'Claude (Default)' },
    { value: 'kernel', label: 'Kernel (Self-hosted)' },
    { value: 'codex', label: 'Codex' },
    { value: 'opencode', label: 'OpenCode' },
]

// After:
const RUNTIME_OPTIONS: { value: RuntimeProvider; label: string; available: boolean }[] = [
    { value: 'claude', label: 'Claude (Default)', available: true },
    { value: 'kernel', label: 'Kernel (Self-hosted)', available: true },
    { value: 'codex', label: 'Codex (Coming Soon)', available: false },
    { value: 'opencode', label: 'OpenCode (Coming Soon)', available: false },
]
```

In the Select component, render unavailable options with `disabled` attribute and
a visual indicator (muted text color, no pointer events).

**Acceptance criteria:**
- [ ] Codex and OpenCode show as grayed-out "Coming Soon" in dropdown
- [ ] User cannot select codex/opencode as default runtime
- [ ] If a user's saved preference is codex/opencode, fall back to 'claude' at load time
- [ ] No changes to `RuntimeId` or `RuntimeProvider` types (keep for future use)

#### Task 1.2: Add fallback validation in preferences loading

**File:** `app/src/main/services/app-preferences.ts`

**Change:** In the `sanitise()` function (or equivalent validation), if `defaultRuntime`
is not in the set of actually-registered runtimes, reset to `'claude'`.

**Acceptance criteria:**
- [ ] `appPreferencesService.get()` never returns an unregistered runtime
- [ ] Existing preferences files with `"defaultRuntime": "codex"` are silently corrected

---

### WS-2: Kernel Transcript Canonicalization

> Priority: High — existing persistence works, but transcript shape is not yet canonical for robust resume/runtime detection
> Effort: ~1 week
> Dependencies: None

**Problem:**
Kernel sessions are already persisted via `SessionOrchestrator -> SessionManager -> ClaudeFilesService`,
but the transcript is incomplete as a durable runtime record:
- there is no guaranteed session header before the first appended user message
- runtime/model metadata is not written in a canonical way
- resume would currently rely on reconstructing `CoreMessage[]` from a lossy flat message log

**Architecture decision:**
Do not introduce a parallel persistence layer in `@codeck/agent-core`.
Instead:
- reuse the existing `ClaudeFilesService` / `SessionManager.appendMessage()` path
- add canonical header/meta records for kernel sessions
- evolve the transcript format only where needed to make resume feasible

**Tasks:**

#### Task 2.1: Ensure kernel sessions write a canonical header through existing persistence

**Files:** `app/src/main/services/session-orchestrator.ts`, `app/src/main/services/claude-files.ts`

**Change:**
- before the first kernel user message is appended, ensure the session file exists
- write a `session_meta` record compatible with current `extractSessionMetadata()`
- keep using the existing append path for subsequent messages

**Acceptance criteria:**
- [ ] First line of every new kernel session is a canonical header record
- [ ] `claudeFilesService.listSessions()` recognizes kernel sessions as `runtime: "kernel"`
- [ ] No new writer abstraction is added to `@codeck/agent-core`

#### Task 2.2: Add runtime/session metadata records needed for history and resume

**Files:** `app/src/main/services/claude-files.ts`, `app/src/main/services/claude-files/messages-to-jsonl.ts`

**Change:**
- add a kernel-specific metadata record (`session_runtime` or equivalent) when the runtime/model is known
- preserve compatibility with existing readers/indexers instead of inventing a second file layout
- document which records are authoritative for `runtime`, `model`, and future resume

**Acceptance criteria:**
- [ ] After a kernel session, a `.jsonl` file exists at the expected path
- [ ] File content remains readable by current `ClaudeFilesService` and `@codeck/sessions`
- [ ] History browser can display kernel sessions alongside SDK sessions
- [ ] Runtime/model metadata is available without scanning arbitrary assistant text
- [ ] Existing `params.onMessage` callback still works (persistence remains additive)

#### Task 2.3: Verify transcript compatibility with the existing history/index stack

**Files:** `app/src/main/services/session-orchestrator.ts`, `packages/sessions/src/server/sync/incremental.ts`

**Change:**
- run the existing list/sync flow against kernel-created sessions
- fix any parsing assumptions that still treat kernel sessions as Claude SDK sessions
- only add `system/init` if it materially improves compatibility beyond `session_meta` + runtime metadata

**Acceptance criteria:**
- [ ] Kernel sessions appear correctly in session list/history without ad-hoc fallbacks
- [ ] The indexer does not require a parallel kernel-only parser path
- [ ] Any added metadata records are documented in this plan before resume work begins

---

### WS-3: Session Resume for Kernel

> Priority: High — most impactful user-facing gap
> Effort: ~1.5 weeks
> Dependencies: WS-2 (canonical transcript must exist first)

**Problem:**
Claude runtime supports resume via SDK's `sessionId` parameter.
Kernel runtime has no equivalent — once the process ends, context is gone.
The current flat JSONL transcript may not be lossless enough to rebuild `CoreMessage[]`
without a validation pass first.

**Architecture decision:**
Resume will use the persisted transcript as source of truth, but only after a round-trip spike
proves that the stored records can reconstruct a coherent `CoreMessage[]` history.
The reader/reconstruction logic should live near `claude-files`, not in generic agent-core.

**Tasks:**

#### Task 3.1: Build a round-trip spike for kernel transcript reconstruction

**Files:** `app/src/main/services/claude-files/*`, tests alongside the implementation

**Change:**
- take a representative kernel transcript
- reconstruct `CoreMessage[]`
- feed it back into `runAgentLoop()` in a test harness
- document which message types are lossless and which require richer persistence

**Acceptance criteria:**
- [ ] Round-trip test proves whether the current transcript is sufficient
- [ ] Any lossy cases are identified before production resume code is written
- [ ] The chosen reconstruction boundary is documented in this plan

#### Task 3.2: Add resume path to KernelService.startSession()

**File:** `app/src/main/services/runtime/kernel-service.ts`

**Change:** When `params.sessionId` is provided and a JSONL file exists for that session:

1. Read history via the reconstruction utility defined in WS-3.1
2. Append new user message to the history
3. Call `runAgentLoop(historyMessages, options)` instead of `startAgentLoop(prompt, options)`
4. Continue writing to the same JSONL file (append mode)

When `params.sessionId` is provided but no JSONL file exists (e.g., it was an SDK session):
- Fall back to starting a fresh session
- Log a warning

**Acceptance criteria:**
- [ ] Resume a kernel session: send message → close app → reopen → send another message → conversation continues coherently
- [ ] Model uses conversation history for context (not just the latest message)
- [ ] JSONL file grows continuously across resume cycles
- [ ] SDK sessions cannot be resumed on kernel runtime (graceful fallback)

#### Task 3.3: Update kernel capability report

**File:** `app/src/main/services/runtime/kernel-runtime-adapter.ts`

**Change:** Set `resume: true` in `KERNEL_CAPABILITIES.supports`.

**Acceptance criteria:**
- [ ] `getCapabilities().supports.resume === true`
- [ ] Any UI that gates on resume capability now shows kernel as capable

---

### WS-4: Plan Mode for Kernel

> Priority: Medium — needed for parity with SDK path
> Effort: ~1 week
> Dependencies: WS-2

**Problem:**
Plan mode means the model outputs thinking + tool_use but no text blocks.
The kernel's agent loop doesn't distinguish permission modes beyond
"bypass" vs "interactive". Plan mode requires:
1. Model is instructed to plan before acting (system prompt modification)
2. Tool execution may require explicit user approval (ExitPlanMode flow)

**Tasks:**

#### Task 4.1: Add plan mode system prompt instructions

**File:** `packages/agent-core/src/prompt/system-prompt.ts`

**Change:** When `permissionMode === 'plan'`, append plan-mode instructions to system prompt:
```
You are in Plan Mode. Before executing any tool, explain your plan using thinking/reasoning.
Present your plan to the user and wait for approval before proceeding with tool calls.
```

**Acceptance criteria:**
- [ ] Plan mode system prompt differs from default mode
- [ ] Model produces thinking blocks explaining its plan
- [ ] Unit test verifies plan mode instructions are included

#### Task 4.2: Implement ExitPlanMode flow in KernelService

**File:** `app/src/main/services/runtime/kernel-service.ts`

**Change:** Add a mechanism for the agent loop to pause and request plan approval:
- When in plan mode and a tool call is about to execute, emit a plan approval request
  via IPC (similar to permission request)
- Wait for `resolveExitPlanMode()` response
- If approved, execute the tool; if rejected, inform model of rejection

**File:** `app/src/main/services/runtime/kernel-runtime-adapter.ts`

**Change:** Implement `resolveExitPlanMode()` to forward to KernelService.

**Acceptance criteria:**
- [ ] Plan mode shows approval dialog before tool execution
- [ ] User can approve or reject the plan
- [ ] Rejection feeds back to the model as context
- [ ] `supportedPermissionModes` includes `'plan'`

---

### WS-5: MCP Server Integration for Kernel

> Priority: Medium — enables tool ecosystem
> Effort: ~2 weeks
> Dependencies: WS-2

**Problem:**
Claude runtime gets MCP tools for free via the SDK. Kernel runtime only has 6 built-in tools today.
MCP (Model Context Protocol) servers provide additional tools via stdio or HTTP transport.

**Tasks:**

#### Task 5.1: MCP client implementation

**File to create:** `packages/agent-core/src/mcp/client.ts`

**Spec:**
```typescript
export interface McpConnection {
  readonly serverName: string
  listTools(): Promise<McpToolDefinition[]>
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  close(): Promise<void>
}

/** Connect to an MCP server via stdio transport. */
export function connectMcpServer(config: McpServerConfig): Promise<McpConnection>
```

Use the `@modelcontextprotocol/sdk` package (official MCP TypeScript SDK).

**Acceptance criteria:**
- [ ] Can connect to a stdio-based MCP server
- [ ] Can list available tools
- [ ] Can call a tool and get results
- [ ] Connection errors are handled gracefully
- [ ] Connection is properly closed on session end

#### Task 5.2: Bridge MCP tools into ToolRegistry

**File:** `packages/agent-core/src/mcp/mcp-tool-bridge.ts`

**Change:** Convert `McpToolDefinition[]` into `ToolDefinition[]` compatible with
the existing `ToolRegistry`. Each MCP tool becomes a regular tool that the agent loop
can call.

**Acceptance criteria:**
- [ ] MCP tools appear alongside built-in tools in the registry
- [ ] Tool descriptions and parameter schemas are preserved
- [ ] MCP tool calls go through the permission gate like built-in tools

#### Task 5.3: Load MCP config and connect in KernelService

**File:** `app/src/main/services/runtime/kernel-service.ts`

**Change:** At session start:
1. Read MCP server configs from `@codeck/config` (via `config-bridge.ts`)
2. Connect to each configured MCP server
3. Bridge MCP tools into the tool registry
4. Clean up connections in the `finally` block

**Acceptance criteria:**
- [ ] MCP servers configured in `~/.claude/.claude.json` are connected
- [ ] MCP tools are available to the kernel agent loop
- [ ] MCP connections are closed when session ends or is aborted

---

### WS-6: Integration Tests

> Priority: High — validation of all above work
> Effort: ~1 week (parallel with other work streams)
> Dependencies: WS-2 at minimum

**Tasks:**

#### Task 6.1: Kernel path integration test suite

**File to create:** `app/src/__integration__/kernel-runtime.test.ts`

**Test scenarios (each requires real API key + network):**

1. **Basic conversation**: Start kernel session → send message → receive streaming response → verify JSONL written
2. **Tool execution**: Send "read the file package.json" → verify Read tool called → verify result returned
3. **Permission flow**: Start with default permission mode → trigger Bash tool → verify permission request emitted via IPC
4. **Session resume**: Start session → exchange 2 messages → close → resume with same sessionId → verify context preserved
5. **Abort**: Start session → abort mid-stream → verify clean termination
6. **Model selection**: Start with `model: 'haiku'` → verify haiku model used (check usage tokens — haiku is cheaper)

**Acceptance criteria:**
- [ ] All 6 scenarios pass with `ANTHROPIC_API_KEY` env var set
- [ ] Tests are in `__integration__/` directory (not run by `pnpm test`)
- [ ] Each test creates a unique session ID to avoid conflicts
- [ ] Tests clean up JSONL files after completion

#### Task 6.2: Multi-session parallel test

**File to create:** `app/src/__integration__/multi-session-kernel.test.ts`

**Test scenario:**
1. Start 2 kernel sessions simultaneously (different sessionIds)
2. Send messages to both
3. Verify both receive responses independently
4. Verify 2 separate JSONL files are created
5. Abort one session, verify the other continues

**Acceptance criteria:**
- [ ] Concurrent kernel sessions don't interfere
- [ ] Per-session AbortController isolation works
- [ ] Each session writes to its own JSONL file

---

## Execution Order

```
Week 1:   WS-1 (runtime truthfulness — immediate)
          WS-2.1 + WS-2.2 + WS-2.3 (JSONL persistence — foundation)

Week 2-3: WS-3.1 + WS-3.2 + WS-3.3 (session resume)
          WS-6.1 (integration tests, scenarios 1-3)

Week 4:   WS-4.1 + WS-4.2 (plan mode)
          WS-6.1 (integration test scenario 4)

Week 5-6: WS-5.1 + WS-5.2 + WS-5.3 (MCP integration)

Week 7:   WS-6.1 (remaining scenarios) + WS-6.2 (multi-session test)

Week 8:   Buffer / bug fixes / documentation
```

**Parallelism opportunities:**
- WS-1 is fully independent — can be done anytime
- WS-4 and WS-5 are independent of each other (both depend on WS-2)
- WS-6 can start as soon as WS-2 is done (early scenarios don't need resume)

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

- [ ] All WS-1 through WS-5 tasks completed
- [ ] All WS-6 integration tests pass
- [ ] `KERNEL_CAPABILITIES` report updated to reflect new capabilities
- [ ] `pnpm test` passes (all unit tests)
- [ ] `pnpm --filter codeck typecheck` passes
- [ ] CLAUDE.md updated with any new conventions or gotchas discovered
- [ ] ROADMAP.md M1 status updated to "Complete"
