# Flat-Rate Agent Experimentation with Claude Code CLI

## The Problem

Building AI agents is expensive. Every prompt iteration, every personality
tweak, every "let me try this system prompt instead" -- that's API tokens
burned. Multiply by 50 test runs a day across development and you're watching
a billing dashboard instead of shipping.

## The Fix

Use the Claude Code CLI as your model backend. Your agent's brain runs on
your Claude subscription (flat rate) instead of per-token API billing.

`@elizaos/plugin-claude-code` registers as a model provider in ElizaOS so
that every `runtime.useModel(ModelType.TEXT_LARGE, ...)` call spawns a fresh
`claude -p` process, passes the prompt, collects the output, cleans up, and
returns text.

Two files. 190 lines total. The entire implementation.

---

## Architecture

### Entry Point: Plugin Registration

`src/index.ts` exports the plugin object that ElizaOS loads at startup:

```typescript
// src/index.ts:24-45
export const claudeCodePlugin: Plugin = {
  name: 'plugin-claude-code',
  description: 'Claude Code CLI integration as a model provider',

  models: {
    TEXT_LARGE: async (runtime, params) => {
      const provider = getProvider(runtime);
      const prompt = typeof params === 'string'
        ? params : (params as any).prompt || '';
      const settings = runtime.character?.settings as Record<string, unknown>;
      const ccSettings = settings?.claudeCode as Record<string, unknown>;
      const model = (ccSettings?.largeModel as 'sonnet' | 'opus' | 'haiku')
        || 'sonnet';
      return provider.generateText(runtime, prompt, model);
    },
    TEXT_SMALL: async (runtime, params) => {
      // Same pattern, defaults to 'haiku' instead of 'sonnet'
    },
  },
};
```

The `models` object is ElizaOS's mechanism for plugins to register model
handlers. When the runtime needs text generation, it looks up registered
handlers by model type (`TEXT_LARGE`, `TEXT_SMALL`). If this plugin is loaded
and configured in `settings.model`, it wins the dispatch.

The provider instance is lazy-initialized on first call (`src/index.ts:7-22`).
One singleton per agent lifetime, reading timeout from character settings.

### The Core: Spawning Claude Code

`src/provider.ts` contains `ClaudeCodeModelProvider` -- a class with one
meaningful method: `generateText()`. Here is the full lifecycle:

**1. Prompt Truncation** (`src/provider.ts:34`)

```typescript
const truncated = prompt.slice(-MAX_PROMPT_LENGTH);  // last 50k chars
```

ElizaOS prompts can be enormous (conversation history, provider context,
system instructions all concatenated). The plugin takes the last 50,000
characters -- keeping the most recent context, discarding older history that
would exceed CLI input limits.

**2. Workspace Creation** (`src/provider.ts:37-40`)

```typescript
const baseTmpDir = process.env.TMPDIR || tmpdir();
tempDir = await mkdtemp(join(baseTmpDir, 'claude-code-'));
```

Every request gets its own temp directory. This is Claude Code's `cwd` -- it
cannot see the host filesystem, only this empty directory. Isolation by
default.

**3. Process Spawn** (`src/provider.ts:45-49`)

```typescript
proc = Bun.spawn(['claude', '-p', truncated, '--model', model], {
  cwd: tempDir,
  stdout: 'pipe',
  stderr: 'pipe',
});
```

This is the heart of it. `Bun.spawn()` launches the `claude` CLI with:
- `-p`: Prompt mode (non-interactive, single-shot)
- `--model`: Which Claude model to use (sonnet, opus, haiku)
- `cwd: tempDir`: The isolated workspace

The process gets piped stdout/stderr for collection.

**4. Timeout Racing** (`src/provider.ts:51-71`)

```typescript
const timeout = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => {
    try { if (proc) proc.kill(); } catch {}
    reject(new Error(`ClaudeCodeTimeout: exceeded ${this.timeout/1000}s`));
  }, this.timeout);
});

const [output, errors, exitCode] = await Promise.race([
  Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]),
  timeout,
]);
```

A `Promise.race` between the process completing and a timeout. If the timeout
fires first, it kills the process and rejects. The production deployment
sets this to 1,800,000ms (30 minutes) for deep research -- but the default
is 120 seconds.

The streams are read using Bun's `ReadableStream` API via `new Response().text()`
-- an elegant pattern that avoids Node.js buffer concatenation.

**5. Response Wrapping** (`src/provider.ts:94-102`)

```typescript
const trimmed = output.trim();
if (!trimmed.startsWith('<response>')) {
  return `<response>\n${trimmed}\n</response>`;
}
return trimmed;
```

ElizaOS expects responses wrapped in `<response>` XML tags for its parsing
pipeline. If Claude Code does not already wrap its output (it usually does not
in `-p` mode), the provider adds the wrapper.

**6. Guaranteed Cleanup** (`src/provider.ts:107-131`)

```typescript
finally {
  if (timeoutId) clearTimeout(timeoutId);
  if (proc) {
    try { proc.kill(); } catch {}
  }
  if (tempDir) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn(`[claude-code] Failed to cleanup ${tempDir}`);
    }
  }
}
```

The `finally` block handles three resources unconditionally:
1. Clear the timeout timer (prevent dangling timers)
2. Kill the process (prevent orphan processes)
3. Delete the temp directory (prevent disk fill)

This runs whether the request succeeds, times out, or throws. No resource
leaks.

---

## Integration with ElizaOS

### Model Selection

ElizaOS's model dispatch works through character settings:

```json
{
  "settings": {
    "model": {
      "TEXT_LARGE": "claude-code/sonnet",
      "TEXT_SMALL": "claude-code/sonnet"
    },
    "claudeCode": {
      "largeModel": "sonnet",
      "smallModel": "sonnet",
      "timeout": 120000
    }
  }
}
```

The `model` section tells ElizaOS which provider handles each model type. The
`claudeCode` section configures the provider itself. The runtime loads the
plugin, sees it registers `TEXT_LARGE` and `TEXT_SMALL` handlers, and routes
matching requests to it.

### What It Replaces

Without this plugin, you would use `plugin-openai`, `plugin-anthropic`, or
`plugin-ollama` as your model provider. Each of those calls an HTTP API
directly. This plugin replaces that with a CLI spawn -- same interface to
ElizaOS, completely different execution model underneath.

---

## Tradeoffs

### Latency

The biggest cost. Direct API calls return in 1-3 seconds for typical prompts.
This plugin adds:
- CLI startup time (~1-2s for `claude` to initialize)
- Claude Code's internal planning phase
- Process spawn overhead

Typical response times: 5-15 seconds. For a chat bot, this is noticeable. For
a codebase research bot that users expect to "think," it is acceptable.

### Process Overhead

Each request spawns a new OS process, creates a temp directory, and cleans it
up. On a busy bot, this means many concurrent `claude` processes. There is no
connection pooling, no request batching, no keep-alive.

### CLI Dependency

The `claude` CLI must be installed globally
(`bun install -g @anthropic-ai/claude-code`). This is an external dependency
that is not managed by the package itself. If the CLI updates and changes its
interface, the plugin breaks.

### No Streaming

The current implementation waits for the full response before returning. No
streaming chunks, no progressive display. Requests block until complete.

### What You Get In Return

- Zero tool-use implementation. No function calling schemas, no tool result
  handling, no conversation loop management.
- Access to Claude's planning without building a planning system.
- Web search without integrating a search API.
- The full Claude Code agent in a single `Bun.spawn()` call.

---

## Running It Yourself

Prerequisites:
```bash
bun install -g @anthropic-ai/claude-code
claude --version  # verify installation
```

Character configuration:
```json
{
  "plugins": ["@elizaos/plugin-claude-code"],
  "settings": {
    "model": {
      "TEXT_LARGE": "claude-code/sonnet",
      "TEXT_SMALL": "claude-code/haiku"
    },
    "claudeCode": {
      "largeModel": "sonnet",
      "smallModel": "haiku",
      "timeout": 120000
    }
  }
}
```

The `ANTHROPIC_API_KEY` environment variable must be set for the `claude` CLI
to authenticate.

That is it. Your ElizaOS agent now uses Claude Code as its brain.
