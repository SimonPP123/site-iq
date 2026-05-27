/**
 * Unit Tests for Security Utilities
 *
 * Tests security-critical helpers: redirect allow-listing, error sanitization, and client-IP
 * extraction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateRedirect,
  sanitizeErrorMessage,
  getClientIp,
} from './security';

describe('validateRedirect', () => {
  describe('allowed redirects', () => {
    it('allows /admin path', () => {
      expect(validateRedirect('/admin')).toBe('/admin');
    });

    it('allows /admin subpaths', () => {
      expect(validateRedirect('/admin/settings')).toBe('/admin/settings');
      expect(validateRedirect('/admin/users')).toBe('/admin/users');
      expect(validateRedirect('/admin/docs')).toBe('/admin/docs');
    });

    it('allows the /audits path', () => {
      expect(validateRedirect('/audits')).toBe('/audits');
    });

    it('allows the /account path and its subpaths', () => {
      expect(validateRedirect('/account')).toBe('/account');
      expect(validateRedirect('/account/usage')).toBe('/account/usage');
    });

    it('allows the Site IQ home and report paths', () => {
      expect(validateRedirect('/')).toBe('/');
      expect(validateRedirect('/audit')).toBe('/audit');
      const reportPath = '/audit/1b22215b-da9d-40c9-970d-b38427a1f81f';
      expect(validateRedirect(reportPath)).toBe(reportPath);
    });
  });

  describe('blocked redirects', () => {
    it('returns default for null redirect', () => {
      expect(validateRedirect(null)).toBe('/admin');
    });

    it('returns default for empty string', () => {
      expect(validateRedirect('')).toBe('/admin');
    });

    it('returns default for non-relative path', () => {
      expect(validateRedirect('https://evil.com')).toBe('/admin');
      expect(validateRedirect('http://evil.com')).toBe('/admin');
    });

    it('blocks protocol-relative URLs (open redirect attack)', () => {
      expect(validateRedirect('//evil.com')).toBe('/admin');
      expect(validateRedirect('//evil.com/admin')).toBe('/admin');
    });

    it('blocks non-allowlisted paths', () => {
      expect(validateRedirect('/random')).toBe('/admin');
      expect(validateRedirect('/home')).toBe('/admin');
      expect(validateRedirect('/login')).toBe('/admin');
    });

    it('blocks paths that look similar but are not allowed', () => {
      expect(validateRedirect('/administrator')).toBe('/admin');
      expect(validateRedirect('/admins')).toBe('/admin');
      expect(validateRedirect('/auditlog')).toBe('/admin'); // not a sub-path of /audit
    });
  });

  describe('custom default path', () => {
    it('uses custom default when provided', () => {
      expect(validateRedirect(null, '/dashboard')).toBe('/dashboard');
      expect(validateRedirect('/evil', '/profile')).toBe('/profile');
    });
  });
});

describe('sanitizeErrorMessage', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  describe('development mode', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    });

    it('returns error message in development', () => {
      const error = new Error('Database connection failed');
      const result = sanitizeErrorMessage(error);
      expect(result).toBe('Database connection failed');
    });

    it('returns default for non-Error objects', () => {
      const result = sanitizeErrorMessage('string error');
      expect(result).toBe('An error occurred');
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    });

    it('returns generic message in production', () => {
      const error = new Error('Sensitive database error with credentials');
      const result = sanitizeErrorMessage(error);
      expect(result).toBe('An error occurred');
    });

    it('uses custom default message', () => {
      const error = new Error('Sensitive error');
      const result = sanitizeErrorMessage(error, 'Something went wrong');
      expect(result).toBe('Something went wrong');
    });

    it('does not leak sensitive information', () => {
      const error = new Error('Connection to postgres://user:password@host failed');
      const result = sanitizeErrorMessage(error);
      expect(result).not.toContain('password');
      expect(result).not.toContain('postgres');
    });
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header (first IP)', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1, 172.16.0.1');
    expect(getClientIp(headers)).toBe('192.168.1.1');
  });

  it('extracts single IP from x-forwarded-for', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '203.0.113.195');
    expect(getClientIp(headers)).toBe('203.0.113.195');
  });

  it('trims whitespace from x-forwarded-for', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '  192.168.1.1  , 10.0.0.1');
    expect(getClientIp(headers)).toBe('192.168.1.1');
  });

  it('falls back to x-real-ip header', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '192.168.1.1');
    expect(getClientIp(headers)).toBe('192.168.1.1');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '10.0.0.1');
    headers.set('x-real-ip', '192.168.1.1');
    expect(getClientIp(headers)).toBe('10.0.0.1');
  });

  it('returns unknown for no headers', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });

  it('handles IPv6 addresses', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '2001:db8::1, 2001:db8::2');
    expect(getClientIp(headers)).toBe('2001:db8::1');
  });
});
