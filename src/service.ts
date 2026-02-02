import { Service, logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import type {
  ClaudeInvokeOptions,
  ClaudeInvokeResult,
  AuthStatus,
  ClaudeCredentials,
} from './types';
import { isAuthError } from './types';

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_PROMPT_LENGTH = 50000;
const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');

/**
 * Unified service for invoking Claude Code CLI.
 * Provides auth status checking, error detection, and process management.
 */
export class ClaudeCodeService extends Service {
  static serviceType = 'claude_code' as const;
  capabilityDescription = 'Invoke Claude Code CLI with auth handling';

  private defaultTimeout: number;
  private authErrorEmitted = false;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.defaultTimeout = DEFAULT_TIMEOUT;
  }

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new ClaudeCodeService(runtime);

    const settings = runtime.character?.settings as Record<string, unknown>;
    const ccSettings = settings?.claudeCode as Record<string, unknown>;

    if (ccSettings?.timeout && typeof ccSettings.timeout === 'number') {
      service.defaultTimeout = ccSettings.timeout;
    }

    // Check auth status on startup
    const authStatus = await service.checkAuth();
    if (!authStatus.authenticated) {
      logger.warn('[claude-code] not authenticated, run: claude login');
      if (authStatus.error) {
        logger.warn(`[claude-code] auth check error: ${authStatus.error}`);
      }
    } else {
      const expiresIn = authStatus.expiresAt
        ? Math.round((authStatus.expiresAt - Date.now()) / 1000 / 60 / 60)
        : 'unknown';
      logger.info(`[claude-code] authenticated (expires in ~${expiresIn}h)`);
    }

    logger.info(`[claude-code] service started (timeout=${service.defaultTimeout}ms)`);
    return service;
  }

  async stop(): Promise<void> {
    logger.info('[claude-code] service stopped');
  }

  /**
   * Check OAuth authentication status by reading credentials file
   */
  async checkAuth(): Promise<AuthStatus> {
    try {
      const content = await readFile(CREDENTIALS_PATH, 'utf-8');
      const creds: ClaudeCredentials = JSON.parse(content);

      if (!creds.claudeAiOauth) {
        return { authenticated: false, needsLogin: true };
      }

      const { expiresAt, subscriptionType, accessToken } = creds.claudeAiOauth;

      if (!accessToken) {
        return { authenticated: false, needsLogin: true };
      }

      const now = Date.now();
      const isExpired = expiresAt && expiresAt < now;

      return {
        authenticated: !isExpired,
        expiresAt,
        subscriptionType,
        needsLogin: isExpired || false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        authenticated: false,
        needsLogin: true,
        error: msg,
      };
    }
  }

  /**
   * Handle auth error - log warning
   */
  private handleAuthError(_stderr: string): void {
    // Only log once per service lifetime to avoid spam
    if (!this.authErrorEmitted) {
      this.authErrorEmitted = true;
      logger.error('[claude-code] OAuth token expired or invalid');
      logger.error('[claude-code] Run: claude login');
    }
  }

  /**
   * Core invocation method for Claude Code CLI
   */
  async invoke(options: ClaudeInvokeOptions): Promise<ClaudeInvokeResult> {
    const {
      prompt,
      model = 'sonnet',
      timeout = this.defaultTimeout,
      cwd,
      allowedTools,
      disallowedTools,
    } = options;

    const startTime = Date.now();
    let tempDir: string | null = null;
    let proc: ReturnType<typeof Bun.spawn> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const truncated = prompt.slice(-MAX_PROMPT_LENGTH);

      // Build command args
      const args = ['claude', '-p', truncated, '--model', model];

      // Add allowed tools if specified
      if (allowedTools) {
        const tools = Array.isArray(allowedTools) ? allowedTools.join(',') : allowedTools;
        args.push('--allowedTools', tools);
      }

      // Add disallowed tools if specified
      if (disallowedTools) {
        const tools = Array.isArray(disallowedTools)
          ? disallowedTools.join(',')
          : disallowedTools;
        args.push('--disallowedTools', tools);
      }

      // Determine working directory
      let workDir: string;
      if (cwd) {
        workDir = resolve(cwd);
      } else {
        // Create isolated temp workspace
        const baseTmpDir = process.env.TMPDIR || tmpdir();
        tempDir = await mkdtemp(join(baseTmpDir, 'claude-code-'));
        workDir = tempDir;
        logger.debug(`[claude-code] created temp workspace: ${tempDir}`);
      }

      logger.info(`[claude-code] invoking model=${model} cwd=${workDir}`);
      logger.debug(`[claude-code] prompt preview: ${truncated.slice(0, 200)}...`);

      proc = Bun.spawn(args, {
        cwd: workDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            if (proc) proc.kill();
          } catch {
            // Process already exited
          }
          reject(new Error(`ClaudeCodeTimeout: exceeded ${timeout / 1000}s`));
        }, timeout);
      });

      const [output, stderr, exitCode] = await Promise.race([
        Promise.all([
          new Response(proc.stdout as ReadableStream).text(),
          new Response(proc.stderr as ReadableStream).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ]);

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const duration = Date.now() - startTime;

      // Check for auth errors in stderr
      if (isAuthError(stderr) || (exitCode !== 0 && isAuthError(output))) {
        this.handleAuthError(stderr || output);
        return {
          output: '',
          exitCode: exitCode ?? 1,
          stderr: stderr || 'OAuth token expired. Run: claude login',
          duration,
        };
      }

      if (exitCode !== 0) {
        logger.error(`[claude-code] exit=${exitCode}`);
        logger.error(`[claude-code] stderr: ${stderr.slice(0, 500)}`);
      } else {
        logger.info(`[claude-code] completed in ${duration}ms`);
      }

      return {
        output: output.trim(),
        exitCode: exitCode ?? 0,
        stderr: stderr.trim(),
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : String(error);

      // Check if timeout error contains auth issues
      if (isAuthError(msg)) {
        this.handleAuthError(msg);
      }

      logger.error(`[claude-code] invocation failed: ${msg}`);

      return {
        output: '',
        exitCode: 1,
        stderr: msg,
        duration,
      };
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

      // Clean up temp workspace (only if we created it)
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

  /**
   * Convenience method for simple text generation (used by model provider)
   */
  async generateText(prompt: string, model: 'sonnet' | 'opus' | 'haiku' = 'sonnet'): Promise<string> {
    const result = await this.invoke({ prompt, model });

    if (result.exitCode !== 0) {
      throw new Error(`ClaudeCodeError: ${result.stderr || 'Unknown error'}`);
    }

    if (!result.output || result.output.length === 0) {
      throw new Error('EmptyOutput: Claude Code returned nothing');
    }

    // Strip XML wrapper tags - consumers get clean text
    let cleanOutput = result.output.trim()
      .replace(/^\s*<response>\s*/i, '')
      .replace(/\s*<\/response>\s*$/i, '')
      .trim();

    return cleanOutput;
  }

  /**
   * Research method (used by ResearchService)
   * Returns raw output for custom parsing
   */
  async research(
    prompt: string,
    options: {
      cwd: string;
      model?: 'sonnet' | 'opus' | 'haiku';
      allowedTools?: string[] | string;
      disallowedTools?: string[] | string;
      timeout?: number;
    }
  ): Promise<ClaudeInvokeResult> {
    return this.invoke({
      prompt,
      model: options.model || 'sonnet',
      timeout: options.timeout || 600000, // 10 min default for research
      cwd: options.cwd,
      allowedTools: options.allowedTools,
      disallowedTools: options.disallowedTools,
    });
  }
}
