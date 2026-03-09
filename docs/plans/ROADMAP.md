# Codeck Long-term Roadmap

> Last updated: 2026-03-09
> Status: Living document — update after each milestone completion

## Vision

Codeck is a **local-first, multi-runtime agent workbench** built on Electron + React.
It is not a Claude Code GUI wrapper — it is a platform that orchestrates multiple agent runtimes
(self-hosted kernel, Anthropic SDK, CLI tools) through a unified session model.

**Core differentiators:**
1. Native `~/.claude/` ecosystem compatibility (zero proprietary data layer)
2. Runtime-agnostic agent orchestration (kernel / SDK / CLI adapters)
3. Multi-session parallel execution with git worktree isolation
4. Desktop-native UX that cloud IDEs and VS Code extensions cannot match

---

## Architecture Principles (Non-negotiable)

1. **File-first data model** — `~/.claude/` is the source of truth. SQLite is index-only.
2. **Immutability** — All state transforms produce new objects, never mutate.
3. **Runtime abstraction** — `RuntimeAdapter` interface is the only contract between orchestration and execution.
4. **SDK isolation** — SDK imports exist only in `claude.ts` and `sdk-types.ts`. All other layers consume `@common/types`.
5. **Capability honesty** — UI must never expose functionality that the active runtime cannot deliver.

---

## Current State (2026-03-09)

| Component | Status | Key Files |
|-----------|--------|-----------|
| Claude runtime (SDK) | Production-ready | `claude.ts`, `claude-runtime-adapter.ts` |
| Kernel runtime (self-hosted) | Functional, gaps remain | `kernel-service.ts`, `@codeck/agent-core`, `@codeck/provider` |
| Multi-session orchestration | Working | `session-orchestrator.ts`, `session-context.ts` |
| Worktree isolation | Working | `worktree-service.ts` |
| Config management | Mature | `@codeck/config`, `config-bridge.ts` |
| Session history indexing | Working | `@codeck/sessions` (Hono + SQLite sidecar) |
| Settings UI | Complete (9 sections) | `settings/sections/*` |
| Message rendering | Optimized | `ConversationFlow`, `AiMessageGroup`, rAF batching |

### Kernel Capability Matrix

| Capability | Claude runtime | Kernel runtime | Gap |
|------------|---------------|----------------|-----|
| New session | Yes | Yes | — |
| Streaming | Yes | Yes | — |
| Permission prompt | Yes | Yes | — |
| Model selection | Yes | Yes | — |
| 6 core tools | Yes | Yes | — |
| API Key / Base URL | N/A (SDK manages) | Yes | — |
| Resume session | Yes | Yes | — |
| Plan mode | Yes | Yes | — |
| MCP (stdio) | Yes | Yes | — |
| ExitPlanMode | Yes | Yes | — |
| AskUserQuestion | Yes | Yes (IPC gate) | — |
| Hooks | Yes | **No** | Medium |
| Checkpointing | Yes | **No** | Medium |
| Rewind files | Yes | **No** | Medium |
| Native file history | Yes | **No** | Low |
| Embedded terminal | Yes | **No** | Low |

---

## Milestones

### M1: Kernel Viability (Phase 5B Part 2) — ✅ Complete

> Goal: Make kernel a credible daily-driver alternative to Claude runtime for basic workflows.

**Completed:**
- ~~Resume session support~~ ✅ via transcript reconstruction (`transcript-to-core-messages.ts`)
- ~~Kernel transcript canonicalization~~ ✅ `session_meta` + `session_runtime` JSONL headers
- ~~Plan mode~~ ✅ system prompt + ExitPlanMode decorator gate
- ~~AskUserQuestion / ExitPlanMode interactive flows~~ ✅ IPC gates in KernelService
- ~~MCP server connection (stdio transport)~~ ✅ `@codeck/agent-core/src/mcp/`
- ~~Runtime truthfulness~~ ✅ `RUNTIME_CATALOG` + UI disabling + preferences validation
- ~~Integration tests~~ ✅ 8 scenarios (6 kernel + 2 multi-session) passing against real API

**Key files:**
- `packages/agent-core/src/loop/agent-loop.ts` — resume entry point
- `app/src/main/services/runtime/kernel-service.ts` — orchestration (resume + MCP + plan mode)
- `app/src/main/services/runtime/kernel-runtime-adapter.ts` — capability report
- `app/src/main/services/claude-files/transcript-to-core-messages.ts` — resume reconstruction
- `app/src/common/runtime-catalog.ts` — shared availability catalog

---

### M2: CLI Runtime Adapter — Target: 6 weeks after M1

> Goal: Support CLI tools (Claude Code CLI, Codex CLI, etc.) as first-class runtimes via structured IO.

**Scope:**
- Protocol spike per target CLI before locking a shared adapter contract
- `CliRuntimeAdapter` implementing `RuntimeAdapter` interface
- stdin/stdout structured communication protocol where the target CLI supports it
- CLI process lifecycle management (spawn, health check, graceful shutdown)
- Message protocol mapping (CLI JSON-lines → `@common/types.Message`)
- Register `codex` and `opencode` as CLI adapter instances in `setup.ts`
- Permission forwarding (CLI permission prompts → GUI approval dialog)

**Exit criteria:**
- User can select "Codex" runtime, configure CLI path, and have a working session
- CLI process crashes are handled gracefully (error message, not app crash)
- Session history from CLI sessions is persisted in standard JSONL format

**Key files to create:**
- `app/src/main/services/runtime/cli-runtime-adapter.ts`
- `app/src/main/services/runtime/cli-process-manager.ts`
- `app/src/main/services/runtime/cli-message-protocol.ts`

**Dependencies:** M1 (runtime truthfulness must be resolved first)

---

### M3: Agent Loop Context Optimization — Target: 4 weeks after M1

> Goal: Kernel produces higher-quality results by managing context window intelligently.

**Scope:**
- Token budget allocation per conversation turn
- Dynamic context pruning (observation masking for tool results)
- System prompt composition pipeline (CLAUDE.md + rules + project context)
- Prompt caching integration (Anthropic ephemeral `cache_control`)
- Priority-based context injection (recent messages > old messages > system context)

**Exit criteria:**
- Long conversations (50+ turns) don't degrade in quality
- Token costs reduce by 30%+ compared to naive full-context approach
- System prompt includes project-level CLAUDE.md and relevant rules

**Key files:**
- `packages/agent-core/src/prompt/system-prompt.ts`
- `packages/agent-core/src/prompt/context-manager.ts` (new)
- `packages/agent-core/src/loop/agent-loop.ts` — message truncation

**Dependencies:** M1 (kernel must be stable before optimizing)

---

### M4: Multi-Agent Foundations — Target: 8 weeks after M2+M3

> Goal: Support both sub-agents (lightweight, in-loop) and agent teams (full session isolation).

**Scope:**

**Sub-agent (in-loop fork):**
- New tool `Agent` / `Task` in `@codeck/agent-core` tool registry
- Sub-agent runs isolated agent loop with constrained tools and limited context
- Returns summary to parent loop (1-2k tokens max)
- Parent loop continues with sub-agent result as tool_result

**Agent team (session-level):**
- Meta-session concept: a session that orchestrates child sessions
- `SessionOrchestrator` extended to support parent → child session relationships
- Inter-session messaging (parent can send instructions, child reports back)
- Tree-structured session hierarchy (visible in SessionPanel)
- Each child session gets its own worktree (optional)

**Exit criteria:**
- Kernel runtime can spawn a sub-agent tool call that executes and returns
- A "team session" can orchestrate 2+ child sessions with role assignment
- SessionPanel shows parent-child relationships
- `parentToolUseId` field in Message type is actively used

**Key files:**
- `packages/agent-core/src/tools/agent.ts` (new — sub-agent tool)
- `app/src/main/services/session-orchestrator.ts` — team session routing
- `app/src/common/types.ts` — Message.parentToolUseId (already exists)
- `packages/sessions/src/analysis/subagent-linker.ts` (already exists — extend for active use)

**Dependencies:** M1 + M2 + M3

---

### M5: Workflow Orchestration UI — Target: 6 weeks after M4

> Goal: Visual workflow for software engineering lifecycle (Plan → Implement → Review → Merge).

**Scope:**
- Workflow definition model (sequence of agent steps with role assignments)
- Built-in "Software Engineering" workflow template
- Workflow progress visualization (timeline/swimlane view)
- Role-to-runtime mapping (e.g., planner = opus/kernel, reviewer = sonnet/kernel)
- Handoff protocol between workflow steps
- User intervention points (approve plan, review changes, confirm merge)

**Exit criteria:**
- User can start a "Plan → Implement → Review" workflow from the UI
- Each step creates a properly-scoped agent session
- Results flow between steps automatically
- User can intervene at any step

**Dependencies:** M4

---

### M6: Production Hardening — Ongoing, parallel to M2-M5

> Goal: Make the app shippable as a standalone executable.

**Scope:**
- Electron upgrade to latest supported version (38+)
- sessions-server bundling (currently `npx tsx` — needs proper packaging)
- Auto-update mechanism
- Error reporting / telemetry (opt-in)
- Installer creation (Windows NSIS, macOS DMG)
- Documentation site (extract from CLAUDE.md to structured docs)

**Exit criteria:**
- `pnpm build` produces installable artifacts
- App starts cleanly from installer without Node.js pre-installed
- Auto-update works for patch releases

---

## Priority Rationale

```
M1 (Kernel Viability)        ← Strategic: kernel is the only path to SDK independence
  ↓
M2 (CLI Adapter)             ← Product: enables users without API keys
M3 (Context Optimization)    ← Quality: makes kernel competitive with SDK path
  ↓
M4 (Multi-Agent)             ← Platform: transforms from tool to platform
  ↓
M5 (Workflow UI)             ← Differentiation: visible multi-agent collaboration
M6 (Production Hardening)    ← Shipping: parallel track, always ongoing
```

M1 is the foundation. Everything else depends on kernel being a credible runtime.

---

## Anti-patterns to Avoid

1. **Don't add more settings UI** before kernel gaps are closed
2. **Don't pursue generic multi-provider** (OpenAI, Google) before kernel is stable on Anthropic
3. **Don't build "universal agent framework"** — stay focused on software engineering workflows
4. **Don't make SQLite a source of truth** — it's always a cache/index layer
5. **Don't add CLI runtimes without a verified protocol spike** — no PTY fallback, no screen scraping
6. **Don't expose unimplemented capabilities in UI** — capability honesty is non-negotiable
