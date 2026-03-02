# Contributing to Codeck

Thank you for your interest in contributing!

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Claude Code CLI** installed and authenticated (`claude` command available)
- **Git** (required for worktree features)

On Windows, ensure Git Bash is installed and set `CLAUDE_CODE_GIT_BASH_PATH` if the SDK subprocess cannot locate it:

```bash
set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe
```

## Setup

```bash
git clone https://github.com/Wha1eChai/codeck.git
cd codeck
pnpm install
```

On first install, approve the Electron build script if prompted:

```bash
pnpm approve-builds electron
```

## Development

```bash
pnpm dev        # Start Electron app with HMR
pnpm test       # Run all unit tests
pnpm lint       # ESLint check (app package)
```

Per-package type checking:

```bash
pnpm --filter codeck typecheck          # All 3 tsconfigs (main/preload/renderer)
pnpm --filter @codeck/config typecheck  # Config library
```

## Integration Tests

Integration tests make real API calls and require a configured API key in `~/.claude/settings.json`:

```bash
# Windows
set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe && pnpm --filter codeck test:integration

# macOS/Linux
pnpm --filter codeck test:integration
```

These are excluded from `pnpm test` and CI by default.

## Project Structure

This is a pnpm monorepo. See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.

```
codeck/
├── app/              # Electron app (main package)
├── packages/
│   ├── config/       # @codeck/config — configuration parsing
│   └── sessions/     # @codeck/sessions — session history (Hono + SQLite)
```

## Pull Request Guidelines

1. Fork the repository and create a branch from `main`
2. Make your changes with clear, focused commits (conventional commits format)
3. Ensure all tests pass: `pnpm test`
4. Ensure no TypeScript errors: `pnpm --filter codeck typecheck`
5. Open a PR against `main` with a description of what changed and why

## Code Style

- TypeScript strict mode throughout
- Immutable patterns — never mutate objects in place
- Small, focused files (200–400 lines typical)
- IPC calls belong in store layer, not components
- No `console.log` in production code (hooks will warn you)
