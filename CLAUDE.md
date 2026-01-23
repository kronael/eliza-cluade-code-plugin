# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ElizaOS plugin that integrates Claude Code CLI as a model provider. Each request spawns `claude` CLI in an isolated temporary workspace that gets auto-cleaned. Plugin exports model handlers (TEXT_LARGE, TEXT_SMALL) that ElizaOS runtime calls.

## Architecture

**Entry point**: `src/index.ts`
- Exports `claudeCodePlugin` singleton with `models` handlers
- Lazy-initializes `ClaudeCodeModelProvider` from character settings
- Maps TEXT_LARGE/SMALL to configurable models (sonnet/opus/haiku)

**Core logic**: `src/provider.ts`
- `ClaudeCodeModelProvider.generateText()` orchestrates request lifecycle:
  1. Create temp dir via `mkdtemp`
  2. Spawn `claude` CLI with `--model` flag
  3. Enforce timeout via `setTimeout` + `proc.kill()`
  4. Cleanup via `finally` block (guaranteed even on timeout/error)
- Wraps responses in `<response>` XML if not already present
- Bun-specific: uses `Bun.spawn()` for process management

**Note**: Spawned Claude Code instances run in an empty temp directory with
`-p` (prompt) mode. No `--allowedTools` restriction is passed, so Claude Code
retains its default tool access (web search, reasoning). However, with no
local files in the temp dir, file/bash tools have nothing to work with.
Effectively: LLM text generation + web search + chain-of-thought.

**Key invariants**:
- Temp workspace MUST be cleaned up (in `finally` block)
- Process MUST be killed on timeout or error
- Timeout timer MUST be cleared after response or on error
- Empty responses are errors (throw `EmptyOutput`)

## Commands

```bash
# Build (outputs to ./dist)
npm run build

# Watch mode for development
npm run dev

# Clean build artifacts
npm run clean

# Type checking (inherited from parent tsconfig.json)
tsc --noEmit
```

## Development Notes

- Uses `tsup` for bundling (ESM only, no CJS)
- Depends on `@elizaos/core` as peer dependency (workspace:*)
- Extends parent `../../tsconfig.json` (ElizaOS monorepo structure)
- Runtime: Bun (uses `Bun.spawn()` instead of Node's `child_process`)

## Settings Schema

Character file must define:
```json
{
  "claudeCode": {
    "largeModel": "sonnet" | "opus" | "haiku",
    "smallModel": "sonnet" | "opus" | "haiku",
    "timeout": 120000  // milliseconds
  }
}
```

## Testing Considerations

- Cannot mock CLI easily (spawns actual `claude` process)
- Temp dir cleanup is critical (test via integration tests)
- Timeout behavior requires real process (cannot unit test easily)
- Manual testing: install locally in ElizaOS workspace, configure character

## Critical Behavior

**Resource cleanup**: Even if Claude Code crashes, timeouts, or throws, the provider MUST:
1. Kill the spawned process
2. Clear the timeout timer
3. Delete the temp workspace

All three happen in `finally` block of `generateText()`.
