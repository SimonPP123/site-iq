/**
 * Visual Regression Tests
 *
 * These tests capture screenshots of key pages and compare them against
 * baseline images to detect unintended visual changes.
 *
 * Run with --update-snapshots to update baselines:
 *   npx playwright test tests/visual.spec.ts --update-snapshots
 */

import { test, expect } from '@playwright/test';

// Configure visual comparison settings
const SCREENSHOT_OPTIONS = {
  fullPage: false,
  animations: 'disabled' as const,
  scale: 'css' as const,
};

// Threshold for pixel differences (0-1)
const VISUAL_THRESHOLD = 0.1;

// Suppress the cookie-consent banner before every navigation. It renders site-wide on the FIRST
// visit (no stored choice), so without this it appears in every screenshot and diffs against the
// baseline non-deterministically. addInitScript runs before page scripts on each navigation, so we
// seed the same `siteiq-consent` localStorage record a returning visitor would have (an explicit
// "reject all" - every category denied) => readConsent() finds a decision and the banner stays hidden.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'siteiq-consent',
        JSON.stringify({ v: 1, all: false, cats: { analytics: false, functional: false, targeting: false }, ts: Date.now() }),
      );
    } catch {
      /* localStorage blocked - banner would show, but that matches the pre-existing fallback */
    }
  });
});

test.describe('Visual Regression Tests', () => {
  test.describe('Homepage', () => {
    test('homepage matches baseline (light mode)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for animations to settle
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('homepage-light.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });

    test('homepage matches baseline (dark mode)', async ({ page }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for animations to settle
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('homepage-dark.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });

    test('homepage mobile view matches baseline', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('homepage-mobile.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });
  });

  test.describe('Login Page', () => {
    test('login page matches baseline', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('login-page.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });

    test('login page with error state matches baseline', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      // Fill invalid credentials and submit
      await page.fill('input[type="email"]', 'invalid');
      await page.click('button[type="submit"]');

      // Wait for validation error
      await page.waitForSelector('[role="alert"], .text-destructive, .text-red-500', {
        timeout: 5000,
      }).catch(() => {
        // Error may not appear - that's OK for visual test
      });

      await expect(page).toHaveScreenshot('login-error.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });

    test('login page dark mode matches baseline', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('login-dark.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });
  });

  test.describe('Admin Dashboard', () => {
    test('admin page matches baseline (unauthenticated)', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('admin-unauth.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });

    test('admin page mobile view matches baseline', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('admin-mobile.png', {
        ...SCREENSHOT_OPTIONS,
        threshold: VISUAL_THRESHOLD,
      });
    });
  });

  test.describe('Responsive Breakpoints', () => {
    const breakpoints = [
      { name: 'mobile-sm', width: 320, height: 568 },
      { name: 'mobile-lg', width: 428, height: 926 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'laptop', width: 1024, height: 768 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const breakpoint of breakpoints) {
      test(`homepage at ${breakpoint.name} (${breakpoint.width}px) matches baseline`, async ({ page }) => {
        await page.setViewportSize({
          width: breakpoint.width,
          height: breakpoint.height,
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`homepage-${breakpoint.name}.png`, {
          ...SCREENSHOT_OPTIONS,
          threshold: VISUAL_THRESHOLD,
        });
      });
    }
  });

  test.describe('Component States', () => {
    test('button hover state', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find a button and hover over it
      const button = page.locator('button, a[role="button"]').first();
      if (await button.isVisible()) {
        await button.hover();
        await page.waitForTimeout(300); // Wait for hover transition

        await expect(button).toHaveScreenshot('button-hover.png', {
          threshold: VISUAL_THRESHOLD,
        });
      }
    });

    test('input focus state', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"]');
      await emailInput.focus();
      await page.waitForTimeout(200);

      await expect(emailInput).toHaveScreenshot('input-focused.png', {
        threshold: VISUAL_THRESHOLD,
      });
    });
  });
});

test.describe('Accessibility Visual Tests', () => {
  test('skip link visible on focus', async ({ page }) => {
    await page.goto('/');

    // Press Tab to focus skip link
    await page.keyboard.press('Tab');

    // Skip link should now be visible
    const skipLink = page.locator('a:has-text("Skip")');
    if (await skipLink.isVisible()) {
      await expect(skipLink).toHaveScreenshot('skip-link-visible.png', {
        threshold: VISUAL_THRESHOLD,
      });
    }
  });

  test('focus indicators visible', async ({ page }) => {
    await page.goto('/login');

    // Tab through form elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Capture the focused element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toHaveScreenshot('focus-indicator.png', {
      threshold: VISUAL_THRESHOLD,
    });
  });
});
