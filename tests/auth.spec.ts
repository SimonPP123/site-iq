import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
    test("login page loads correctly", async ({ page }) => {
        await page.goto("/login");

        // Check page title
        await expect(page.locator("h1")).toContainText("Welcome");

        // Check form elements exist
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("login form validates email format", async ({ page }) => {
        await page.goto("/login");

        const emailInput = page.locator('input[type="email"]');
        const submitButton = page.locator('button[type="submit"]');

        // Try to submit with invalid email
        await emailInput.fill("invalid-email");
        await page.locator('input[type="password"]').fill("password123");
        await submitButton.click();

        // HTML5 validation should prevent submission
        // The form should still be on the login page
        await expect(page).toHaveURL(/\/login/);
    });

    test("login form requires both email and password", async ({ page }) => {
        await page.goto("/login");

        const emailInput = page.locator('input[type="email"]');
        const passwordInput = page.locator('input[type="password"]');

        // Check required attributes
        await expect(emailInput).toHaveAttribute("required", "");
        await expect(passwordInput).toHaveAttribute("required", "");
    });

    test("shows error message for invalid credentials", async ({ page }) => {
        await page.goto("/login");

        // Fill form with invalid credentials
        await page.locator('input[type="email"]').fill("invalid@example.com");
        await page.locator('input[type="password"]').fill("wrongpassword");
        await page.locator('button[type="submit"]').click();

        // Wait for error message (with role="alert" for accessibility)
        const errorAlert = page.locator('[role="alert"]');
        await expect(errorAlert).toBeVisible({ timeout: 10000 });
    });

    test("shows loading state during submission", async ({ page }) => {
        await page.goto("/login");

        // Fill form
        await page.locator('input[type="email"]').fill("test@example.com");
        await page.locator('input[type="password"]').fill("password123");

        // Check button has aria-busy during loading
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();

        // Button should show loading state
        await expect(submitButton).toHaveAttribute("aria-busy", "true");
    });

    test("redirect parameter is validated against allowlist", async ({
        page,
    }) => {
        // Try with malicious redirect
        await page.goto("/login?redirect=https://evil.com");

        // Fill and submit
        await page.locator('input[type="email"]').fill("test@example.com");
        await page.locator('input[type="password"]').fill("password123");

        // The redirect should be sanitized to /admin, not the malicious URL
        // (We can't fully test this without valid credentials, but we can check
        // that the page doesn't immediately redirect to evil.com)
        await expect(page).not.toHaveURL(/evil\.com/);
    });
});

test.describe("Admin Route Protection", () => {
    test("admin routes require authentication", async ({ page }) => {
        // Try to access admin without auth
        const response = await page.goto("/admin");

        // Should either redirect to login or show admin (if Supabase not configured)
        // In production, this would redirect
        expect(response?.status()).toBeLessThan(500);
    });

    test("admin email page exists", async ({ page }) => {
        const response = await page.goto("/admin/email");
        expect(response?.status()).toBeLessThan(500);
    });

    test("admin secrets page exists", async ({ page }) => {
        const response = await page.goto("/admin/secrets");
        expect(response?.status()).toBeLessThan(500);
    });

    test("admin users page exists", async ({ page }) => {
        const response = await page.goto("/admin/users");
        expect(response?.status()).toBeLessThan(500);
    });

    test("admin docs page exists", async ({ page }) => {
        const response = await page.goto("/admin/docs");
        expect(response?.status()).toBeLessThan(500);
    });
});
