# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ElizaOS plugin that integrates Claude Code CLI as a model provider. Each request spawns `claude` CLI in an isolated temporary workspace (auto-cleaned). Exports model handlers (TEXT_LARGE, TEXT_SMALL) and `ClaudeCodeService` for other plugins.

## Architecture

```
src/index.ts     Plugin entry - exports claudeCodePlugin, registers service, maps model types
src/service.ts   ClaudeCodeService - unified CLI invocation with auth handling
src/provider.ts  ClaudeCodeModelProvider - delegates to service or direct CLI fallback
src/types.ts     Interfaces (ClaudeInvokeOptions, ClaudeInvokeResult, AuthStatus, isAuthError)
```

**Flow**: ElizaOS → model handler → provider → service → `claude` CLI → temp workspace

**Key invariants**:
- Temp workspace cleaned in `finally` block
- Process killed on timeout/error
- Auth errors logged once per service lifetime (no spam)
- Empty responses throw `EmptyOutput`

## Commands

```bash
bun run build    # Build to ./dist
bun run dev      # Watch mode
bun test         # Run tests
npm publish      # Publish to npm
```

## Character Settings

```json
{
  "claudeCode": {
    "largeModel": "sonnet",
    "smallModel": "haiku",
    "timeout": 120000
  }
}
```

## Auth

OAuth credentials at `~/.claude/.credentials.json`. Service checks on startup, detects auth errors in stderr. Not auto-recoverable - user must run `claude login`.

## Testing

- `src/types.test.ts` - Unit tests for auth error pattern detection
- Integration tests require actual `claude` CLI installed
