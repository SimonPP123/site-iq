import { test, expect } from "@playwright/test";

/**
 * Admin auth-boundary E2E. These assert the SECURITY PROPERTY (unauthenticated visitors must NOT
 * reach the admin area), not the old insecure dev behavior. Every admin page calls requireAdmin()
 * which notFound()s non-admins, and middleware gates /admin to the ADMIN_EMAILS allowlist - so a
 * logged-out request must NOT receive a 200 that renders admin content; it should 404 or redirect
 * to /login. (Run against a Supabase-configured env; the previous "expect 200 while logged out"
 * encoded dev-without-Supabase behavior and would have hidden a world-readable /admin/secrets
 * regression in production.)
 */

const ADMIN_PAGES = ["/admin", "/admin/docs", "/admin/secrets", "/admin/users", "/admin/email", "/admin/contact"];

test.describe("Admin auth boundary (unauthenticated)", () => {
  for (const path of ADMIN_PAGES) {
    test(`unauthenticated ${path} is not world-readable (404 or login redirect, never a 200 admin page)`, async ({ page }) => {
      const response = await page.goto(path);
      const status = response?.status() ?? 0;
      const url = page.url();
      const redirectedToLogin = url.includes("/login");
      // Security property: NOT a 200 that stayed on the admin URL.
      const exposedAdmin = status === 200 && url.includes("/admin") && !redirectedToLogin;
      expect(exposedAdmin, `${path} must not expose admin content to a logged-out visitor`).toBe(false);
      // And positively: either a 404 (requireAdmin notFound) or a login redirect.
      expect(status === 404 || redirectedToLogin).toBe(true);
    });
  }
});
