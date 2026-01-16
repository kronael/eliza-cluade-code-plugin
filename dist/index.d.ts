import { Plugin } from '@elizaos/core';

interface ClaudeCodeOptions {
    timeout?: number;
}
/**
 * Model provider that uses Claude Code CLI to generate responses.
 * Each request gets an isolated temporary workspace that's automatically cleaned up.
 */
declare class ClaudeCodeModelProvider {
    private timeout;
    constructor(options?: ClaudeCodeOptions);
    generateText(_runtime: unknown, prompt: string, model?: 'sonnet' | 'opus' | 'haiku'): Promise<string>;
    getEmbeddingResponse(_input: string): Promise<number[]>;
}

declare const claudeCodePlugin: Plugin;

export { ClaudeCodeModelProvider, claudeCodePlugin, claudeCodePlugin as default };
