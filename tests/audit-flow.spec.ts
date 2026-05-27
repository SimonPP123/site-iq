import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage of the core audit flow. The first two tests need no account (they exercise the
 * client-side domain validation and the logged-out gate). The authenticated block runs only when
 * E2E_EMAIL + E2E_PASSWORD are provided, so CI without seeded creds skips it instead of failing.
 */
test.describe("audit flow", () => {
  test("rejects an invalid domain client-side (no failed audit)", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/enter a domain/i).fill("asdf");
    await page.getByRole("button", { name: /grade my site/i }).click();
    // A clear inline error, and we stay on the landing page (no report row, no n8n run).
    await expect(page.getByText(/valid domain|full domain|domain ending|IP address/i)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a valid domain while logged out routes to login", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/enter a domain/i).fill("example.com");
    await page.getByRole("button", { name: /grade my site/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signed-out users are redirected away from protected routes", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("authenticated", () => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, "set E2E_EMAIL + E2E_PASSWORD to run the authenticated audit-flow tests");

    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email!);
      await page.getByLabel(/password/i).fill(password!);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    });

    test("account page shows the Free plan and usage", async ({ page }) => {
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: /account/i })).toBeVisible();
      await expect(page.getByText("Free")).toBeVisible();
      await expect(page.getByText(/audits/i)).toBeVisible();
    });

    test("signed-in user is bounced off /signup", async ({ page }) => {
      await page.goto("/signup");
      await expect(page).not.toHaveURL(/\/signup/);
    });

    test("submitting a valid domain creates a report and opens it", async ({ page }) => {
      await page.goto("/");
      await page.getByPlaceholder(/enter a domain/i).fill("example.com");
      await page.getByRole("button", { name: /grade my site/i }).click();
      await expect(page).toHaveURL(/\/audit\/[0-9a-f-]{36}/, { timeout: 20_000 });
    });
  });
});
