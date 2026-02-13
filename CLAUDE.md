# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

ElizaOS plugin that uses Claude Code CLI as a model provider. Each
request spawns `claude` CLI in a temp workspace (auto-cleaned). Exports
model handlers (TEXT_LARGE, TEXT_SMALL) and `ClaudeCodeService` for
other plugins. Uses Bun runtime.

## Architecture

```
src/index.ts     Plugin entry, registers service, maps model types
src/service.ts   ClaudeCodeService - CLI invocation with auth handling
src/provider.ts  ClaudeCodeModelProvider - delegates to service, direct CLI fallback
src/types.ts     Interfaces (ClaudeInvokeOptions, ClaudeInvokeResult, AuthStatus)
src/types.test.ts  Unit tests for auth error pattern detection
```

**Flow**: ElizaOS -> model handler -> provider -> service -> `claude` CLI

## Non-obvious patterns

- Provider has TWO code paths: service delegation (normal) and direct
  CLI fallback (when service unavailable). The fallback uses tail-only
  truncation (`slice(-50000)`) vs service's token-based 60/40 head+tail
  split. Both wrap output in `<response>` tags.
- `research()` strips `<response>` XML tags from output;
  `generateText()` adds them. Callers must know which they're getting.
- `invoke()` returns errors as result objects (exitCode != 0);
  `generateText()` throws on errors. Different error contracts.
- Auth error detection runs against BOTH stderr AND stdout (some CLI
  versions output auth errors to stdout).
- Provider instance is a module-level singleton (`providerInstance`).
  First runtime to initialize it wins the timeout config.
- Temp workspace only created when `cwd` is not provided. If `cwd` is
  set, no temp dir is created and no cleanup happens.
- Process is killed in `finally` even after normal exit (safe no-op).
- Embeddings not supported -- `getEmbeddingResponse()` always throws.

## Commands

```bash
bun run build    # Build to ./dist
bun run dev      # Watch mode
bun test         # Unit tests (auth pattern detection)
```

## Testing

- `src/types.test.ts` - auth error pattern detection
- Integration tests need actual `claude` CLI installed
- No mocking of CLI process in unit tests
