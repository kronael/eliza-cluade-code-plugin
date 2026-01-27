# Changelog

## [0.3.0] - 2025-01-27

### Added
- `ClaudeCodeService` - unified service for CLI invocation with OAuth auth handling
- `src/types.ts` - shared types (`ClaudeInvokeOptions`, `ClaudeInvokeResult`, `AuthStatus`)
- `isAuthError()` - detect auth failures in stderr (token expired, unauthorized, etc.)
- Auth status check on service startup, logs warning if credentials expired
- Unit tests for auth error pattern detection (`src/types.test.ts`)

### Changed
- Renamed package from `@elizaos/plugin-claude-code` to `eliza-plugin-claude-code`
- `ClaudeCodeModelProvider` now delegates to `ClaudeCodeService` when available
- Plugin registers `ClaudeCodeService` in `services` array
- Build uses `bun build` instead of `tsup` for simpler standalone builds
- tsconfig.json is now self-contained (no parent extends)

### Fixed
- Auth errors now detected and reported clearly ("Run: claude login")
- Auth error logging limited to once per service lifetime (no spam)
