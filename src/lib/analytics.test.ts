/**
 * Unit tests for the dataLayer helper + typed event wrappers. Pins the exact payload of every event
 * (so the GTM triggers stay in sync) and HARD-asserts the PII rule: no event may carry an email,
 * password, message text, or URL. Env-agnostic: window is stubbed, so this passes in node or jsdom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  pushDL,
  trackSignUp,
  trackLogin,
  trackAuditStarted,
  trackAuditCompleted,
  trackReportViewed,
  trackSampleViewed,
  trackChatMessageSent,
  trackContactCtaClick,
} from "./analytics";

describe("analytics dataLayer helper", () => {
  let dl: unknown[];
  beforeEach(() => {
    dl = [];
    vi.stubGlobal("window", { dataLayer: dl } as unknown as Window);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pushDL pushes onto window.dataLayer", () => {
    pushDL({ event: "test", foo: 1 });
    expect(dl).toEqual([{ event: "test", foo: 1 }]);
  });

  it("pushDL initialises dataLayer when it is missing", () => {
    vi.stubGlobal("window", {} as unknown as Window);
    pushDL({ event: "x" });
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toEqual([{ event: "x" }]);
  });

  it("pushDL no-ops on the server (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => pushDL({ event: "x" })).not.toThrow();
  });
});

describe("analytics typed event wrappers", () => {
  let dl: unknown[];
  beforeEach(() => {
    dl = [];
    vi.stubGlobal("window", { dataLayer: dl } as unknown as Window);
  });
  afterEach(() => vi.unstubAllGlobals());

  const cases: Array<[string, () => void, Record<string, unknown>]> = [
    ["sign_up", () => trackSignUp({ method: "password" }), { event: "sign_up", method: "password" }],
    ["login", () => trackLogin({ method: "password" }), { event: "login", method: "password" }],
    ["audit_started", () => trackAuditStarted({ audit_domain: "example.com" }), { event: "audit_started", audit_domain: "example.com" }],
    [
      "audit_completed",
      () => trackAuditCompleted({ audit_domain: "example.com", report_id: "r1", audit_status: "done" }),
      { event: "audit_completed", audit_domain: "example.com", report_id: "r1", audit_status: "done" },
    ],
    ["report_viewed", () => trackReportViewed({ report_id: "r1" }), { event: "report_viewed", report_id: "r1" }],
    ["sample_report_viewed", () => trackSampleViewed({ sample_id: "s1" }), { event: "sample_report_viewed", sample_id: "s1" }],
    ["chat_message_sent", () => trackChatMessageSent({ chat_message_length: 42 }), { event: "chat_message_sent", chat_message_length: 42 }],
    ["contact_cta_click", () => trackContactCtaClick({ audit_domain: "example.com" }), { event: "contact_cta_click", audit_domain: "example.com" }],
  ];

  it.each(cases)("%s pushes exactly the expected payload", (_name, fn, expected) => {
    fn();
    expect(dl).toEqual([expected]);
  });

  it("no event wrapper ever carries a PII key", () => {
    const FORBIDDEN = ["email", "password", "message", "text", "content", "url", "query", "body", "name"];
    const fns = cases.map(([, fn]) => fn);
    for (const fn of fns) {
      dl.length = 0;
      fn();
      const keys = Object.keys(dl[0] as Record<string, unknown>);
      for (const k of FORBIDDEN) expect(keys).not.toContain(k);
    }
  });
});
