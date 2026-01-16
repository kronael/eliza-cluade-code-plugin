# plugin-claude-code

Claude Code CLI integration as a model provider for ElizaOS agents.

## Features

- Uses Claude Code CLI for text generation (pure LLM mode)
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
3. Provider spawns `claude` CLI with prompt + model flag (restricted mode: no tools)
4. Claude Code generates response as XML (wraps in `<response>` if needed)
5. Provider cleans up temporary workspace (guaranteed via finally block)
6. Provider returns text to ElizaOS

**Key Point**: Claude Code runs in restricted mode with NO tool access (no file operations, bash, web search, or task spawning). Pure LLM text generation only.

### Error Handling

- Automatic timeout handling (default: 2 minutes)
- Process cleanup on timeout or error
- Temporary workspace cleanup guaranteed
- Graceful handling of process termination

## License

MIT
