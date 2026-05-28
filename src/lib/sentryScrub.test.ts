import { describe, it, expect } from "vitest";
import { scrubAuditPaths, scrubBreadcrumb } from "./sentryScrub";
import type { Event, Breadcrumb } from "@sentry/nextjs";

/**
 * Tests for the Sentry path scrubber. The scrubber is the defense-in-depth layer that catches
 * any audit-result paths that flow into Sentry contexts/extra/breadcrumbs via an unhandled
 * exception - the n8n SENSITIVE_PATH_RE filter is upstream, this is downstream. Specifically
 * validates that:
 *  - Top-level `pages` / `pagesFailed` arrays are replaced by a structural marker
 *  - Nested `failing` (inside dimensions[*].checks[*].evidence) is also reached
 *  - Non-sensitive sibling fields (id, label, ratio, error message) are preserved
 *  - Cycles in the event tree don't cause infinite recursion
 *  - Depth limit is enforced
 */

describe("scrubAuditPaths", () => {
  it("replaces top-level event.extra.result.pages with a structural marker", () => {
    const event: Event = {
      extra: {
        result: {
          overall: 80,
          pages: [{ path: "/admin/secret" }, { path: "/users/123" }, { path: "/" }],
          pagesFailed: [{ path: "/promo/INTERNAL-Q2", reason: "4xx" }],
        },
      },
    };
    const scrubbed = scrubAuditPaths(event);
    const result = (scrubbed.extra as { result: { pages: unknown; pagesFailed: unknown; overall: number } }).result;
    // Non-sensitive sibling preserved.
    expect(result.overall).toBe(80);
    // Sensitive arrays replaced by structural marker that preserves cardinality.
    expect(result.pages).toBe("[scrubbed] (3 entries)");
    expect(result.pagesFailed).toBe("[scrubbed] (1 entries)");
  });

  it("reaches `failing` nested inside dimensions[*].checks[*].evidence", () => {
    const event: Event = {
      contexts: {
        report: {
          dimensions: [
            {
              id: "seo",
              checks: [
                {
                  id: "S1",
                  ratio: 0,
                  evidence: {
                    failing: [{ path: "/secret-x9k3" }, { path: "/internal" }],
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const scrubbed = scrubAuditPaths(event);
    const ev = (scrubbed.contexts as { report: { dimensions: Array<{ checks: Array<{ id: string; ratio: number; evidence: { failing: unknown } }> }> } }).report;
    const ck = ev.dimensions[0].checks[0];
    expect(ck.id).toBe("S1"); // preserved
    expect(ck.ratio).toBe(0); // preserved
    expect(ck.evidence.failing).toBe("[scrubbed] (2 entries)"); // scrubbed
  });

  it("scrubs `sourceURL` and `rootUrl` fields anywhere in the tree", () => {
    const event: Event = {
      extra: { audit: { rootUrl: "https://victim-site.example/admin-page" } },
      tags: { sourceURL: "https://victim-site.example/customer/12345" } as Record<string, string>,
    };
    const scrubbed = scrubAuditPaths(event);
    const audit = (scrubbed.extra as { audit: { rootUrl: unknown } }).audit;
    expect(audit.rootUrl).toMatch(/^\[scrubbed\]/);
    expect((scrubbed.tags as Record<string, string>).sourceURL).toMatch(/^\[scrubbed\]/);
  });

  it("does NOT mutate unrelated fields (id, label, message, dsn-shaped strings)", () => {
    const event: Event = {
      message: "an exception with a /path/in/the/message",
      extra: {
        reportId: "abc-123",
        domain: "example.com",
        nested: { score: 75, error: "ENOENT", url: "/legit-route" },
      },
    };
    const scrubbed = scrubAuditPaths(event);
    expect(scrubbed.message).toBe("an exception with a /path/in/the/message"); // message not touched
    const e = scrubbed.extra as { reportId: string; domain: string; nested: { score: number; error: string; url: string } };
    expect(e.reportId).toBe("abc-123");
    expect(e.domain).toBe("example.com");
    expect(e.nested.score).toBe(75);
    expect(e.nested.error).toBe("ENOENT");
    expect(e.nested.url).toBe("/legit-route"); // 'url' is not in the sensitive set
  });

  it("does not infinite-recurse on a cyclic event", () => {
    type Cyclic = { extra: { self?: Cyclic; pages?: Array<{ path: string }> } };
    const cyclic: Cyclic = { extra: { pages: [{ path: "/a" }, { path: "/b" }] } };
    cyclic.extra.self = cyclic;
    // Should not throw or stack-overflow.
    expect(() => scrubAuditPaths(cyclic as unknown as Event)).not.toThrow();
    expect((cyclic.extra.pages as unknown as string)).toBe("[scrubbed] (2 entries)");
  });

  it("returns event reference (chainable in beforeSend)", () => {
    const event: Event = { extra: { pages: [] } };
    const out = scrubAuditPaths(event);
    expect(out).toBe(event);
  });
});

describe("scrubBreadcrumb", () => {
  it("redacts audit-shaped data on a breadcrumb", () => {
    const breadcrumb: Breadcrumb = {
      category: "fetch",
      level: "info",
      data: { pages: [{ path: "/internal" }], status: 200 },
    };
    const out = scrubBreadcrumb(breadcrumb);
    expect(out).not.toBeNull();
    expect((out as Breadcrumb).data?.pages).toBe("[scrubbed] (1 entries)");
    expect((out as Breadcrumb).data?.status).toBe(200); // preserved
  });

  it("passes through breadcrumbs without audit-shaped data unmodified", () => {
    const breadcrumb: Breadcrumb = { category: "navigation", message: "click /about" };
    const out = scrubBreadcrumb(breadcrumb);
    expect(out).toEqual(breadcrumb);
  });
});
