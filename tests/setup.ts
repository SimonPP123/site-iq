/**
 * Vitest Test Setup
 *
 * This file is run before each test file to set up the test environment.
 * It configures mocks and polyfills needed for testing React components
 * and Next.js utilities.
 */

import '@testing-library/jest-dom';
import { vi, afterEach, afterAll } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Headers(),
}));

// Mock window.matchMedia for responsive components and animations.
// Guarded: route handler tests run in the `node` environment where `window` is undefined.
if (typeof window !== 'undefined')
  Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock scrollTo (jsdom only)
if (typeof window !== 'undefined') window.scrollTo = vi.fn();

// Mock console.error to fail tests on React warnings (optional, strict mode)
const originalError = console.error;
console.error = (...args: unknown[]) => {
  // Uncomment to fail on React warnings:
  // if (typeof args[0] === 'string' && args[0].includes('Warning:')) {
  //   throw new Error(args[0]);
  // }
  originalError.call(console, ...args);
};

// Clean up mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Reset all mocks after all tests
afterAll(() => {
  vi.resetAllMocks();
});
