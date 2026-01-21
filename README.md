# @elizaos/plugin-claude-code

Claude Code CLI integration as a model provider for ElizaOS agents.

**Status**: Ready for npm publishing

## Features

- Uses Claude Code CLI for text generation with tool access
- Each request runs in isolated temporary workspace (auto-cleaned)
- Configurable model (sonnet, opus, haiku)
- Configurable timeout (default: 120 seconds)
- Guaranteed resource cleanup on timeout or error
- Safe for production - no file system modifications

## Installation

```bash
npm install @elizaos/plugin-claude-code
# or
bun add @elizaos/plugin-claude-code
```

## Prerequisites

Claude Code CLI must be installed and available in PATH:

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

## Usage

Add to your character file:

```json
{
  "plugins": [
    "@elizaos/plugin-claude-code"
  ],
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

## Configuration

### Character Settings

```json
{
  "claudeCode": {
    "largeModel": "sonnet",      // "sonnet" | "opus" | "haiku"
    "smallModel": "haiku",       // Used for TEXT_SMALL requests
    "timeout": 120000            // Timeout in ms (default: 2 min)
  }
}
```

Note: Each request creates an isolated temporary workspace that is automatically cleaned up.

### Model Selection

Use `claude-code` as the provider in model settings:

```json
{
  "model": {
    "default": "claude-code/sonnet",
    "TEXT_LARGE": "claude-code/sonnet",
    "TEXT_SMALL": "claude-code/haiku"
  }
}
```

## How It Works

1. ElizaOS sends prompt to ClaudeCodeModelProvider
2. Provider creates isolated temporary workspace (via mkdtemp)
3. Provider spawns `claude` CLI with prompt + model flag
4. Claude Code runs in temp workspace with tool access
5. Claude Code generates response as XML (wraps in `<response>` if needed)
6. Provider cleans up temporary workspace (guaranteed via finally block)
7. Provider returns text to ElizaOS

**Key Point**: Each request is isolated. Claude Code does NOT have access to your actual codebase. For codebase exploration, use `plugin-codebase-helper` instead.

### Error Handling

- Automatic timeout handling (default: 2 minutes)
- Process cleanup on timeout or error
- Temporary workspace cleanup guaranteed
- Graceful handling of process termination

## Available Tools

Claude Code has access to standard tools in its temporary workspace:
- `Read` - Read file contents
- `Glob` - Find files by pattern
- `Grep` - Search file contents
- `Bash` - Shell commands (read-only operations only)
- `WebSearch`, `WebFetch` - Web research
- `Task` - Spawn sub-agents for complex work

**Disabled tools** (no file system modifications):
- `Edit`, `Write`, `NotebookEdit` - All disabled
- `Bash` write operations - Filtered out

Since each request runs in an empty temp directory, these tools are primarily useful for web research and reasoning, not codebase exploration.

## Performance

- Response time: 5-15 seconds (vs 1-2s for API models)
- Reason: Claude Code explores codebase before responding
- Best for: Questions requiring code context
- Not ideal for: Quick chat, greetings, simple queries

## Comparison: plugin-claude-code vs plugin-codebase-helper

| Feature | plugin-claude-code | plugin-codebase-helper (ResearchService) |
|---------|-------------------|------------------------------------------|
| **Purpose** | Model provider for ElizaOS | Codebase research and knowledge building |
| **When used** | Every message (if set as TEXT_LARGE/SMALL) | Background research on knowledge gaps |
| **Workspace** | Empty temp directory | Actual codebase directory |
| **Codebase access** | ❌ No | ✅ Yes (Read, Glob, Grep of real files) |
| **Web research** | ✅ Yes | ✅ Yes |
| **Git operations** | ❌ No | ✅ Yes (can clone repos) |
| **Speed** | 5-15s | 30-180s (max 30min for deep research) |
| **Output** | Raw text response | Structured facts saved to YAML |
| **Caching** | None (stateless) | ✅ Stores facts for reuse |
| **Notification** | Synchronous (blocks) | Asynchronous (queued) |

**When to use plugin-claude-code**:
- You want Claude Code as your default model provider
- You need web research capabilities in responses
- You value Claude Code's reasoning and tool use

**When to use plugin-codebase-helper**:
- You want the bot to learn about your codebase over time
- You need automatic research on knowledge gaps
- You want persistent knowledge (facts stored in YAML)

**Using both together** (recommended):
```json
{
  "plugins": ["plugin-claude-code", "plugin-codebase-helper"],
  "settings": {
    "model": {
      "TEXT_LARGE": "claude-code/sonnet",
      "TEXT_SMALL": "claude-code/sonnet"
    }
  }
}
```

This gives you:
- Claude Code as the LLM (better reasoning, web research)
- Codebase helper for automatic research and knowledge building
- Best of both worlds: smart responses + growing knowledge base

## License

MIT
