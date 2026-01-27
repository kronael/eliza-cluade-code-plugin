# @elizaos/plugin-claude-code

Claude Code CLI integration as a model provider for ElizaOS agents.

## Installation

```bash
npm install github:kronael/eliza-plugin-claude-code
```

Prerequisites:
```bash
npm install -g @anthropic-ai/claude-code
claude --version  # Verify installation
```

## Usage

Add to your character file:

```json
{
  "plugins": ["eliza-plugin-claude-code"],
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

Model options: `sonnet`, `opus`, `haiku`

## How It Works

1. ElizaOS sends prompt to ClaudeCodeModelProvider
2. Provider creates isolated temporary workspace
3. Spawns `claude` CLI with prompt + model flag
4. Claude Code runs with tool access (web research, etc.)
5. Response returned, temp workspace cleaned up

Each request is isolated. Claude Code does NOT have access to your actual codebase.

## ClaudeCodeService

Other plugins can use the service directly:

```typescript
const service = runtime.getService<ClaudeCodeService>('claude_code');

// Simple generation
const text = await service.generateText(prompt, 'sonnet');

// Full control
const result = await service.invoke({
  prompt,
  model: 'sonnet',
  timeout: 300000,
  cwd: '/path/to/project',
  allowedTools: ['Read', 'Glob', 'Grep'],
  disallowedTools: ['Edit', 'Write'],
});
```

## Available Tools

In temporary workspace:
- `Read`, `Glob`, `Grep` - File operations
- `Bash` - Shell commands (read-only)
- `WebSearch`, `WebFetch` - Web research
- `Task` - Sub-agents

Disabled: `Edit`, `Write`, `NotebookEdit`

## Performance

Response time: 5-15 seconds (vs 1-2s for API models). Best for questions requiring reasoning and web research.

## License

MIT
