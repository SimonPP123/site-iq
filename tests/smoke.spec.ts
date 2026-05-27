import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
    test("homepage loads successfully", async ({ page }) => {
        const response = await page.goto("/");
        expect(response?.status()).toBe(200);
        await expect(page).toHaveTitle(/Site IQ/);
    });

    test("homepage has main content", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("main")).toBeVisible();
    });

    test("login page loads", async ({ page }) => {
        const response = await page.goto("/login");
        expect(response?.status()).toBe(200);
        await expect(page.locator("h1")).toContainText("Welcome");
    });

    test("login form is functional", async ({ page }) => {
        await page.goto("/login");

        // Check form elements exist
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("no console errors on homepage", async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => {
            if (msg.type() === "error") {
                errors.push(msg.text());
            }
        });

        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Ignore backend-connectivity noise (Supabase calls, failed resource loads). The intent is
        // to catch unexpected JS/React errors, not missing-backend warnings.
        const unexpectedErrors = errors.filter((error) => {
            const e = error.toLowerCase();
            return (
                !e.includes("supabase") &&
                !e.includes("environment") &&
                !e.includes("failed to load resource") &&
                !e.includes("err_") &&
                !e.includes("fetch") &&
                // Dev-server only: `next dev` (Turbopack) uses eval in its runtime, which the production
                // CSP (script-src without unsafe-eval) blocks - Firefox logs it as a console error while
                // Chromium/WebKit stay quiet. The production build never evals, so it never occurs on the
                // deployed site; treat it as environment noise, not an app error.
                !e.includes("content-security-policy")
            );
        });
        expect(unexpectedErrors).toHaveLength(0);
    });
});
