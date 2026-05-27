import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  isAdminEmail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims } })) }));
vi.mock("@/lib/admin", () => ({ isAdminEmail: h.isAdminEmail }));
vi.mock("next/navigation", () => ({ notFound: h.notFound }));

import { requireAdmin } from "./admin-guard";

beforeEach(() => {
  vi.clearAllMocks();
  h.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("requireAdmin", () => {
  it("returns the claims for an allowlisted admin", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "admin@site.iq" } } });
    h.isAdminEmail.mockReturnValue(true);
    const claims = await requireAdmin();
    expect((claims as { email: string }).email).toBe("admin@site.iq");
    expect(h.notFound).not.toHaveBeenCalled();
  });

  it("calls notFound() for a signed-in non-admin", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: { sub: "u2", email: "user@x.com" } } });
    h.isAdminEmail.mockReturnValue(false);
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.notFound).toHaveBeenCalled();
  });

  it("calls notFound() when there are no claims", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: null } });
    h.isAdminEmail.mockReturnValue(false);
    await expect(requireAdmin()).rejects.toThrow();
  });
});
