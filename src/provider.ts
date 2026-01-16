import { logger } from '@elizaos/core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TIMEOUT = 120000; // 2 minutes
const MAX_PROMPT_LENGTH = 50000;

interface ClaudeCodeOptions {
  timeout?: number;
}

/**
 * Model provider that uses Claude Code CLI to generate responses.
 * Each request gets an isolated temporary workspace that's automatically cleaned up.
 */
export class ClaudeCodeModelProvider {
  private timeout: number;

  constructor(options: ClaudeCodeOptions = {}) {
    this.timeout = options.timeout || TIMEOUT;
  }

  async generateText(
    _runtime: unknown,
    prompt: string,
    model: 'sonnet' | 'opus' | 'haiku' = 'sonnet'
  ): Promise<string> {
    let tempDir: string | null = null;
    let proc: ReturnType<typeof Bun.spawn> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const truncated = prompt.slice(-MAX_PROMPT_LENGTH);

      // Create isolated temp workspace for this request
      tempDir = await mkdtemp(join(tmpdir(), 'claude-code-'));
      logger.debug(`[claude-code] Created temp workspace: ${tempDir}`);

      logger.debug(`[claude-code] Generating with model=${model}`);
      logger.debug(`[claude-code] Prompt preview: ${truncated.slice(0, 500)}...`);

      proc = Bun.spawn(
        [
          'claude',
          '-p',
          truncated,
          '--model',
          model,
        ],
        {
          cwd: tempDir,
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );

      timeoutId = setTimeout(() => {
        if (proc) {
          proc.kill();
        }
      }, this.timeout);

      const [output, errors] = await Promise.all([
        new Response(proc.stdout as ReadableStream).text(),
        new Response(proc.stderr as ReadableStream).text(),
      ]);

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = errors.trim();
        const stdout = output.trim();
        logger.error(`[claude-code] Failed (exit=${exitCode})`);
        logger.error(`[claude-code] stderr: ${stderr}`);
        logger.error(`[claude-code] stdout: ${stdout}`);
        throw new Error(`ClaudeCodeError: ${stderr || stdout || 'Unknown error'}`);
      }

      if (!output || output.trim().length === 0) {
        throw new Error('EmptyOutput: Claude Code returned nothing');
      }

      logger.debug(`[claude-code] Response (length=${output.length})`);
      logger.debug(`[claude-code] Raw output preview: ${output.slice(0, 300)}...`);

      const trimmed = output.trim();

      // If response doesn't start with <response>, wrap it
      if (!trimmed.startsWith('<response>')) {
        logger.debug('[claude-code] Adding <response> wrapper');
        return `<response>\n${trimmed}\n</response>`;
      }

      return trimmed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[claude-code] Generation failed: ${msg}`);
      throw error;
    } finally {
      // Ensure timeout is cleared
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Ensure process is killed
      if (proc) {
        try {
          proc.kill();
        } catch {
          // Process already exited
        }
      }

      // Clean up temp workspace
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
          logger.debug(`[claude-code] Cleaned up temp workspace: ${tempDir}`);
        } catch (cleanupError) {
          logger.warn(`[claude-code] Failed to cleanup ${tempDir}: ${cleanupError}`);
        }
      }
    }
  }

  async getEmbeddingResponse(_input: string): Promise<number[]> {
    throw new Error('ClaudeCodeModelProvider does not support embeddings');
  }
}
