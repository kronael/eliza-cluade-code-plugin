/**
 * Options for invoking Claude Code CLI
 */
export interface ClaudeInvokeOptions {
  /** The prompt to send to Claude */
  prompt: string;
  /** Model to use (defaults to 'sonnet') */
  model?: 'sonnet' | 'opus' | 'haiku';
  /** Timeout in milliseconds (defaults to service default) */
  timeout?: number;
  /** Working directory for the CLI process */
  cwd?: string;
  /** Allowed tools (comma-separated or array) */
  allowedTools?: string[] | string;
  /** Disallowed tools (comma-separated or array) */
  disallowedTools?: string[] | string;
}

/**
 * Result from a Claude Code CLI invocation
 */
export interface ClaudeInvokeResult {
  /** Standard output from the CLI */
  output: string;
  /** Exit code from the process */
  exitCode: number;
  /** Standard error from the CLI */
  stderr: string;
  /** Duration of the invocation in milliseconds */
  duration: number;
}

/**
 * Authentication status for Claude Code CLI
 */
export interface AuthStatus {
  /** Whether authentication is valid */
  authenticated: boolean;
  /** Token expiration timestamp (ms since epoch) */
  expiresAt?: number;
  /** Subscription type (e.g., 'team', 'pro') */
  subscriptionType?: string;
  /** Whether user needs to run 'claude login' */
  needsLogin: boolean;
  /** Error message if auth check failed */
  error?: string;
}

/**
 * OAuth credentials stored by Claude CLI
 */
export interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
  };
}

/**
 * Auth error patterns to detect in stderr
 */
export const AUTH_ERROR_PATTERNS = [
  'OAuth token has expired',
  'Authentication required',
  'token expired',
  'refresh token',
  'invalid token',
  'unauthorized',
  'Please run `claude login`',
  'not logged in',
] as const;

/**
 * Check if error message indicates an auth failure
 */
export function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}
