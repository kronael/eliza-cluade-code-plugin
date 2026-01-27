import { logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaudeCodeService } from './service';

const TIMEOUT = 120000; // 2 minutes
const MAX_PROMPT_LENGTH = 50000;

interface ClaudeCodeOptions {
  timeout?: number;
}

/**
 * Model provider that uses Claude Code CLI to generate responses.
 * When ClaudeCodeService is available, delegates to it for unified auth handling.
 * Otherwise falls back to direct CLI invocation.
 */
export class ClaudeCodeModelProvider {
  private timeout: number;

  constructor(options: ClaudeCodeOptions = {}) {
    this.timeout = options.timeout || TIMEOUT;
  }

  async generateText(
    runtime: unknown,
    prompt: string,
    model: 'sonnet' | 'opus' | 'haiku' = 'sonnet'
  ): Promise<string> {
    // Try to use ClaudeCodeService if available (unified auth handling)
    const typedRuntime = runtime as IAgentRuntime | undefined;
    if (typedRuntime?.getService) {
      const service = typedRuntime.getService<ClaudeCodeService>('claude_code');
      if (service) {
        logger.debug('[claude-code] using ClaudeCodeService for generation');
        return service.generateText(prompt, model);
      }
    }

    // Fallback to direct invocation (backward compat)
    return this.invokeDirectly(prompt, model);
  }

  /**
   * Direct CLI invocation (fallback when service not available)
   */
  private async invokeDirectly(
    prompt: string,
    model: 'sonnet' | 'opus' | 'haiku'
  ): Promise<string> {
    let tempDir: string | null = null;
    let proc: ReturnType<typeof Bun.spawn> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const truncated = prompt.slice(-MAX_PROMPT_LENGTH);

      // Create isolated temp workspace for this request
      const baseTmpDir = process.env.TMPDIR || tmpdir();
      tempDir = await mkdtemp(join(baseTmpDir, 'claude-code-'));
      logger.debug(`[claude-code] created temp workspace: ${tempDir}`);

      logger.debug(`[claude-code] generating with model=${model}`);
      logger.debug(`[claude-code] prompt preview: ${truncated.slice(0, 500)}...`);

      proc = Bun.spawn(['claude', '-p', truncated, '--model', model], {
        cwd: tempDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            if (proc) {
              proc.kill();
            }
          } catch {
            // Process already exited
          }
          reject(new Error(`ClaudeCodeTimeout: exceeded ${this.timeout / 1000}s`));
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

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (exitCode !== 0) {
        const stderr = errors.trim();
        const stdout = output.trim();
        logger.error(`[claude-code] failed (exit=${exitCode})`);
        logger.error(`[claude-code] stderr: ${stderr}`);
        logger.error(`[claude-code] stdout: ${stdout}`);
        throw new Error(`ClaudeCodeError: ${stderr || stdout || 'Unknown error'}`);
      }

      if (!output || output.trim().length === 0) {
        throw new Error('EmptyOutput: Claude Code returned nothing');
      }

      logger.debug(`[claude-code] response (length=${output.length})`);
      logger.debug(`[claude-code] raw output preview: ${output.slice(0, 300)}...`);

      const trimmed = output.trim();

      // If response doesn't start with <response>, wrap it
      if (!trimmed.startsWith('<response>')) {
        logger.debug('[claude-code] adding <response> wrapper');
        return `<response>\n${trimmed}\n</response>`;
      }

      return trimmed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[claude-code] generation failed: ${msg}`);
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
          logger.debug(`[claude-code] cleaned up temp workspace: ${tempDir}`);
        } catch (cleanupError) {
          logger.warn(`[claude-code] failed to cleanup ${tempDir}: ${cleanupError}`);
        }
      }
    }
  }

  async getEmbeddingResponse(_input: string): Promise<number[]> {
    throw new Error('ClaudeCodeModelProvider does not support embeddings');
  }
}
