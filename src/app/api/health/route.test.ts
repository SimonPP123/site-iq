// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ from: vi.fn(), serviceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: h.serviceClient }));

import { GET } from "./route";

const reqUrl = (qs = "") => new Request("http://localhost/api/health" + qs);

beforeEach(() => {
  vi.clearAllMocks();
  h.from.mockReturnValue({ select: () => ({ limit: vi.fn().mockResolvedValue({ error: null }) }) });
  h.serviceClient.mockReturnValue({ from: h.from });
});

describe("GET /api/health", () => {
  it("returns a 200 liveness payload by default", async () => {
    const res = await GET(reqUrl());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("site-iq");
  });

  it("returns 200 ready when the DB responds (?ready)", async () => {
    const res = await GET(reqUrl("?ready=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.db).toBe("ok");
  });

  it("returns 503 degraded when the DB check fails", async () => {
    h.from.mockReturnValue({ select: () => ({ limit: vi.fn().mockResolvedValue({ error: { message: "down" } }) }) });
    const res = await GET(reqUrl("?ready=1"));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });
});
