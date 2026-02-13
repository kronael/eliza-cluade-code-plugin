# eliza-plugin-claude-code

Claude Code CLI as a model provider for ElizaOS. Spawns isolated CLI processes
with OAuth auth handling, timeout management, and temp workspace cleanup.

## Installation

```bash
bun add github:kronael/eliza-plugin-claude-code
```

Requires Claude Code CLI:
```bash
npm install -g @anthropic-ai/claude-code
claude login  # OAuth authentication
```

## Usage

Add to character file:

```json
{
  "plugins": ["eliza-plugin-claude-code"],
  "settings": {
    "claudeCode": {
      "largeModel": "sonnet",
      "smallModel": "haiku",
      "timeout": 120000,
      "maxPromptTokens": 200000,
      "tokenCharRatio": 4
    }
  }
}
```

Models: `sonnet` (default), `opus`, `haiku`

`maxPromptTokens` limits prompt size by token estimate (converted with
`tokenCharRatio`) before invoking Claude Code. Truncation preserves both the
start and end of the prompt.

## Authentication

Reads OAuth credentials from `~/.claude/.credentials.json`. On startup, service
logs auth status and token expiry. Auth errors (expired token, unauthorized) are
detected in CLI stderr and logged once per service lifetime.

If auth fails: `claude login`

## ClaudeCodeService API

Other plugins can use the service directly:

```typescript
import type { ClaudeCodeService } from 'eliza-plugin-claude-code';

const service = runtime.getService<ClaudeCodeService>('claude_code');
```

### generateText(prompt, model?)

Returns text wrapped in `<response>` tags. Throws on error or empty output.

```typescript
const text = await service.generateText('Explain monads', 'sonnet');
```

### invoke(options)

Full control over CLI invocation. Returns `ClaudeInvokeResult`.

```typescript
const result = await service.invoke({
  prompt: 'Analyze this codebase',
  model: 'sonnet',
  timeout: 300000,
  cwd: '/path/to/project',
  allowedTools: ['Read', 'Glob', 'Grep'],
  disallowedTools: ['Edit', 'Write'],
});

// result: { output, exitCode, stderr, duration }
```

### research(prompt, options)

For codebase research with longer timeout (10min default).

```typescript
const result = await service.research('Find all API endpoints', {
  cwd: '/path/to/repo',
  allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
  timeout: 600000,
});
```

### checkAuth()

Returns current OAuth status.

```typescript
const status = await service.checkAuth();
// { authenticated, expiresAt?, subscriptionType?, needsLogin, error? }
```

## Types

```typescript
interface ClaudeInvokeOptions {
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  timeout?: number;
  cwd?: string;
  allowedTools?: string[] | string;
  disallowedTools?: string[] | string;
}

interface ClaudeInvokeResult {
  output: string;
  exitCode: number;
  stderr: string;
  duration: number;
}
```

## License

MIT
