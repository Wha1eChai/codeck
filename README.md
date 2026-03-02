# Codeck

A native desktop GUI for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), built with Electron + React.

Codeck wraps the official `@anthropic-ai/claude-agent-sdk` to provide a graphical interface for Claude Code — streaming chat, permission approval, diff views, session management, and more — without replacing the CLI workflow.

## Features

- **Streaming Chat** — Real-time conversation with thinking process timeline and tool call visualization
- **Multi-Session** — Run multiple Claude sessions in parallel with tab-based switching
- **Permission Approval** — Inline permission review for tool calls (Bash, Edit, Write, etc.) with risk-based scoping
- **Diff View** — Unified and side-by-side diff rendering for file edits
- **Session History** — Browse and resume past sessions across all projects
- **Git Worktree Isolation** — Optionally isolate each session in its own git worktree
- **Token Dashboard** — Real-time token usage tracking with cost estimation (via [ccusage](https://github.com/ryoppippi/ccusage))
- **Checkpoint Timeline** — Visual timeline of session checkpoints
- **Settings UI** — GUI for managing CLI settings, plugins, agents, MCP servers, hooks, and memory
- **Native File Integration** — Reads/writes directly to `~/.claude/` — no extra database, no config migration

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 34 |
| Build | electron-vite |
| Frontend | React 19 + TypeScript 5.7 |
| Styling | Tailwind CSS 4 + Radix UI |
| State | Zustand |
| SDK | @anthropic-ai/claude-agent-sdk |
| Data | ~/.claude/ native files (JSON/JSONL/Markdown) |

## Project Structure

This is a pnpm monorepo:

```
codeck/
├── app/                     # Electron desktop app (main package)
├── packages/
│   ├── config/              # Configuration parsing library (@codeck/config)
│   └── sessions/            # Session history service (@codeck/sessions, Hono + SQLite)
├── package.json             # Workspace root
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Claude Code CLI** installed and configured (with a valid API key)
- **Git** (for worktree features)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Wha1eChai/codeck.git
cd codeck

# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

On first run, the app reads your existing `~/.claude/` configuration — no additional setup needed if Claude Code CLI is already configured.

### Windows Note

If the SDK subprocess cannot find Git Bash, set the environment variable:

```bash
set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe
```

## Scripts

```bash
pnpm dev              # Start dev mode (electron-vite HMR)
pnpm build            # Production build
pnpm test             # Run unit tests (Vitest)
pnpm lint             # ESLint check
```

Per-package scripts:

```bash
pnpm --filter codeck typecheck        # TypeScript check (3 sub-tsconfigs)
pnpm --filter codeck test:integration # SDK integration tests (needs API key)
pnpm --filter @codeck/config test   # Config library tests
pnpm --filter @codeck/sessions test # Session service tests
```

## Architecture Overview

```
Renderer (React)
    ↕ IPC (Zod-validated)
Main Process
    ├── SessionOrchestrator  → multi-session routing
    ├── ClaudeService        → SDK query() wrapper
    ├── sdk-adapter/         → pure-function message parsing layer
    ├── SessionManager       → in-memory session state
    ├── WorktreeService      → git worktree lifecycle
    ├── config-bridge        → @codeck/config integration
    └── sessions-server      → @codeck/sessions HTTP subprocess
```

The SDK adapter layer (`sdk-adapter/`) is a set of pure functions that parse the 16 SDK message variants into internal `Message[]` types, keeping SDK imports isolated to a single boundary.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0).

For commercial licensing options (proprietary use, OEM integration, or SaaS deployment without AGPL obligations), please contact: **whaleora@gmail.com**

## Disclaimer

Codeck is an independent project and is **not affiliated with, endorsed by, or sponsored by Anthropic, PBC**.
"Claude" and "Claude Code" are trademarks of Anthropic, PBC.

This software depends on `@anthropic-ai/claude-agent-sdk`, which is governed by
[Anthropic's Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms).
Users must hold a valid API key and comply with Anthropic's terms independently.

Codeck does not collect, transmit, or store your API keys or credentials.
All authentication is handled locally through your existing Claude Code CLI configuration.
