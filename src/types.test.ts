/**
 * Unit tests for auth error detection patterns
 *
 * Test cases:
 * - OAuth token expired messages
 * - Authentication required messages
 * - Invalid token messages
 * - Normal error messages (should NOT match)
 */

import { describe, expect, test } from 'bun:test';
import { isAuthError, AUTH_ERROR_PATTERNS } from './types';

describe('isAuthError', () => {
  test('detects OAuth token expired', () => {
    expect(isAuthError('OAuth token has expired')).toBe(true);
    expect(isAuthError('Error: OAuth token has expired, please re-authenticate')).toBe(true);
  });

  test('detects authentication required', () => {
    expect(isAuthError('Authentication required')).toBe(true);
    expect(isAuthError('Error: Authentication required to proceed')).toBe(true);
  });

  test('detects token expired', () => {
    expect(isAuthError('token expired')).toBe(true);
    expect(isAuthError('Your access token expired')).toBe(true);
  });

  test('detects refresh token issues', () => {
    expect(isAuthError('refresh token invalid')).toBe(true);
    expect(isAuthError('The refresh token has been revoked')).toBe(true);
  });

  test('detects invalid token', () => {
    expect(isAuthError('invalid token')).toBe(true);
    expect(isAuthError('Error: invalid token provided')).toBe(true);
  });

  test('detects unauthorized', () => {
    expect(isAuthError('unauthorized')).toBe(true);
    expect(isAuthError('Error: Unauthorized access')).toBe(true);
  });

  test('detects claude login prompt', () => {
    expect(isAuthError('Please run `claude login`')).toBe(true);
    expect(isAuthError('Not logged in. Please run `claude login` first')).toBe(true);
  });

  test('detects not logged in', () => {
    expect(isAuthError('not logged in')).toBe(true);
    expect(isAuthError('You are not logged in')).toBe(true);
  });

  test('does NOT match normal errors', () => {
    expect(isAuthError('Network timeout')).toBe(false);
    expect(isAuthError('File not found')).toBe(false);
    expect(isAuthError('Process exited with code 1')).toBe(false);
    expect(isAuthError('Rate limit exceeded')).toBe(false);
    expect(isAuthError('')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(isAuthError('OAUTH TOKEN HAS EXPIRED')).toBe(true);
    expect(isAuthError('Token Expired')).toBe(true);
    expect(isAuthError('AUTHENTICATION REQUIRED')).toBe(true);
  });
});

describe('AUTH_ERROR_PATTERNS', () => {
  test('has expected patterns', () => {
    expect(AUTH_ERROR_PATTERNS).toContain('OAuth token has expired');
    expect(AUTH_ERROR_PATTERNS).toContain('Authentication required');
    expect(AUTH_ERROR_PATTERNS).toContain('token expired');
    expect(AUTH_ERROR_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});
