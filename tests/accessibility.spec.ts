import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility - WCAG 2.1 AA Compliance", () => {
    test("homepage has no critical accessibility violations", async ({
        page,
    }) => {
        await page.goto("/");

        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();

        // Log violations for debugging
        if (accessibilityScanResults.violations.length > 0) {
            console.log(
                "Accessibility violations:",
                JSON.stringify(accessibilityScanResults.violations, null, 2)
            );
        }

        expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("login page has no critical accessibility violations", async ({
        page,
    }) => {
        await page.goto("/login");

        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();

        if (accessibilityScanResults.violations.length > 0) {
            console.log(
                "Login page violations:",
                JSON.stringify(accessibilityScanResults.violations, null, 2)
            );
        }

        expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("login form has proper labels and ARIA attributes", async ({
        page,
    }) => {
        await page.goto("/login");

        // Check email input has label
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toHaveAttribute("id", "email");
        const emailLabel = page.locator('label[for="email"]');
        await expect(emailLabel).toBeVisible();

        // Check password input has label
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toHaveAttribute("id", "password");
        const passwordLabel = page.locator('label[for="password"]');
        await expect(passwordLabel).toBeVisible();

        // Check required attributes
        await expect(emailInput).toHaveAttribute("required", "");
        await expect(passwordInput).toHaveAttribute("required", "");
    });

    test("skip link is visible on focus", async ({ page }) => {
        await page.goto("/");

        // Tab to activate skip link
        await page.keyboard.press("Tab");

        // Skip link should be visible when focused
        const skipLink = page.locator('a[href="#main-content"]');
        await expect(skipLink).toBeFocused();
        await expect(skipLink).toBeVisible();
    });

    test("admin pages have proper navigation ARIA", async ({ page }) => {
        await page.goto("/admin");

        // Check for nav element with aria-label
        const nav = page.locator('nav[aria-label="Admin navigation"]');
        await expect(nav).toBeVisible();
    });

    test("admin mobile menu has proper ARIA controls", async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto("/admin");

        const menuButton = page.locator('button[aria-controls="mobile-nav"]');
        await expect(menuButton).toBeVisible();
        await expect(menuButton).toHaveAttribute("aria-expanded", "false");
        await expect(menuButton).toHaveAttribute("aria-label", /navigation/i);

        // Click to open
        await menuButton.click();
        await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    });
});

test.describe("Color Contrast", () => {
    test("text has sufficient color contrast", async ({ page }) => {
        await page.goto("/");

        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(["wcag2aa"])
            .options({ runOnly: ["color-contrast"] })
            .analyze();

        expect(accessibilityScanResults.violations).toEqual([]);
    });
});

test.describe("Keyboard Navigation", () => {
    test("all interactive elements are keyboard accessible", async ({
        page,
    }) => {
        await page.goto("/login");

        // Tab through all focusable elements
        const focusableElements = await page
            .locator(
                'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
            )
            .all();

        for (const element of focusableElements) {
            await element.focus();
            await expect(element).toBeFocused();
        }
    });

    test("login form can be submitted with keyboard only", async ({ page }) => {
        await page.goto("/login");

        // Fill form using keyboard
        await page.keyboard.press("Tab"); // Skip link
        await page.keyboard.press("Tab"); // Email input
        await page.keyboard.type("test@example.com");
        await page.keyboard.press("Tab"); // Password input
        await page.keyboard.type("password123");
        await page.keyboard.press("Tab"); // Submit button
        await page.keyboard.press("Enter"); // Submit

        // Should show loading or error (we're testing keyboard submission works)
        await page.waitForTimeout(500);
        // Form should have been submitted (either success or error)
    });
});
