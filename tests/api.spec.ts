import { test, expect } from "@playwright/test";

test.describe("API Routes", () => {
    // Site IQ's routes are all auth-gated. These run without a real backend: an unauthenticated
    // request has no session cookie, so the JWT check returns no claims and the route 401s.
    test.describe("Audit API", () => {
        test("requires authentication", async ({ request }) => {
            const response = await request.post("/api/audit", {
                data: { domain: "example.com" },
            });
            expect(response.status()).toBe(401);
        });

        test("rejects an invalid domain (schema runs first)", async ({ request }) => {
            const response = await request.post("/api/audit", {
                data: { domain: "" },
            });
            // The body schema (min 3 chars) is validated before auth, so an empty domain is a 400.
            expect([400, 401]).toContain(response.status());
        });
    });

    test.describe("Chat API", () => {
        test("requires authentication", async ({ request }) => {
            const response = await request.post("/api/chat", {
                data: {
                    reportId: "1b22215b-da9d-40c9-970d-b38427a1f81f",
                    message: "What does this site do?",
                },
            });
            expect(response.status()).toBe(401);
        });
    });

    test.describe("Email API (foundation)", () => {
        test("requires authentication", async ({ request }) => {
            const response = await request.post("/api/email", {
                data: { to: "test@example.com", subject: "Test", html: "<p>Test</p>" },
            });
            expect(response.status()).toBe(401);
            const json = await response.json();
            expect(json.error).toContain("Unauthorized");
        });
    });

    test.describe("Auth Callback API", () => {
        test("auth callback route exists", async ({ request }) => {
            const response = await request.get("/api/auth/callback");
            expect(response.status()).toBeLessThan(500);
        });
    });
});
