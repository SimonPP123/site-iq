/**
 * Unit tests for the consent model + storage. Covers the category -> Consent-Mode-v2-signal mapping,
 * the localStorage round-trip, the 365-day mirror cookie, the re-prompt rules (stale / version bump),
 * clearing, and SSR safety. Env-agnostic: window/document/navigator are stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readConsent,
  writeConsent,
  clearConsent,
  categoriesToSignals,
  hasGlobalPrivacyControl,
  GRANTED_CATEGORIES,
  CONSENT_VERSION,
  CONSENT_STORAGE_KEY,
  CONSENT_COOKIE_NAME,
} from "./consent";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

describe("consent storage", () => {
  let store: ReturnType<typeof fakeStorage>;
  let cookieJar: string;
  beforeEach(() => {
    store = fakeStorage();
    cookieJar = "";
    vi.stubGlobal("window", { localStorage: store, location: { protocol: "https:" } });
    vi.stubGlobal("document", {
      get cookie() { return cookieJar; },
      set cookie(v: string) { cookieJar = v; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps categories to the six Consent Mode v2 signals", () => {
    expect(categoriesToSignals({ analytics: true, functional: false, targeting: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
    });
    const all = categoriesToSignals(GRANTED_CATEGORIES);
    expect(all.ad_user_data).toBe("granted");
    expect(all.ad_personalization).toBe("granted");
  });

  it("round-trips writeConsent -> readConsent", () => {
    writeConsent({ analytics: true, functional: false, targeting: false });
    const r = readConsent();
    expect(r).not.toBeNull();
    expect(r?.cats).toEqual({ analytics: true, functional: false, targeting: false });
    expect(r?.v).toBe(CONSENT_VERSION);
    expect(r?.all).toBe(false);
  });

  it("writes a 365-day, SameSite=Lax, Secure mirror cookie", () => {
    writeConsent(GRANTED_CATEGORIES);
    expect(cookieJar).toContain(`${CONSENT_COOKIE_NAME}=`);
    expect(cookieJar).toContain(`Max-Age=${ONE_YEAR_SECONDS}`);
    expect(cookieJar).toContain("SameSite=Lax");
    expect(cookieJar).toContain("Secure");
  });

  it("re-prompts (returns null) for a record older than 365 days", () => {
    store.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: CONSENT_VERSION, all: true, cats: GRANTED_CATEGORIES, ts: Date.now() - (ONE_YEAR_SECONDS + 60) * 1000 }),
    );
    expect(readConsent()).toBeNull();
  });

  it("re-prompts (returns null) when the schema version changed", () => {
    store.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: CONSENT_VERSION + 1, all: true, cats: GRANTED_CATEGORIES, ts: Date.now() }),
    );
    expect(readConsent()).toBeNull();
  });

  it("clearConsent removes the stored choice", () => {
    writeConsent(GRANTED_CATEGORIES);
    expect(readConsent()).not.toBeNull();
    clearConsent();
    expect(readConsent()).toBeNull();
  });

  it("readConsent is SSR-safe (null on the server)", () => {
    vi.stubGlobal("window", undefined);
    expect(readConsent()).toBeNull();
  });
});

describe("Global Privacy Control", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reflects navigator.globalPrivacyControl", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    expect(hasGlobalPrivacyControl()).toBe(true);
    vi.stubGlobal("navigator", { globalPrivacyControl: false });
    expect(hasGlobalPrivacyControl()).toBe(false);
  });
});
