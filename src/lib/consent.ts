/**
 * Consent state model + storage for the in-house cookie banner.
 *
 * Mirrors the proven Dexinal pharma CMP model (in-house, no plugin): a localStorage record plus a
 * mirror cookie (365d), a category -> Consent-Mode-signal mapping, and an `applyConsentUpdate` that
 * pushes `gtag('consent','update',...)` together with the two dataLayer signals Dexinal uses.
 *
 * Categories -> Google Consent Mode v2 signals:
 *   analytics  -> analytics_storage
 *   targeting  -> ad_storage + ad_user_data + ad_personalization
 *   functional -> functionality_storage + personalization_storage
 *   security_storage is ALWAYS granted (strictly-necessary) and is not user-toggleable.
 *
 * Everything here is SSR-safe (typeof window / document guards). The inline <head> bootstrap reads
 * the same `siteiq-consent` key synchronously to re-apply a prior grant before React hydrates - so
 * the shape below is a contract shared with ConsentBootstrap; do not change it without updating both.
 */

/** Schema version. Bump to force a re-prompt after a material cookie-policy change. */
export const CONSENT_VERSION = 1;

/** localStorage key. Kebab-case, consistent with the existing `siteiq-theme` key. */
export const CONSENT_STORAGE_KEY = "siteiq-consent";

/** Mirror cookie name (underscored, cookie convention) for a future server-side read. */
export const CONSENT_COOKIE_NAME = "siteiq_consent";

/** 365 days, in seconds and ms - matches Dexinal's retention. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const ONE_YEAR_MS = ONE_YEAR_SECONDS * 1000;

/** The three user-toggleable categories. "Necessary" is always-on and is not represented here. */
export type ConsentCategories = {
  analytics: boolean;
  functional: boolean;
  targeting: boolean;
};

/** The persisted consent record (localStorage shape, mirrored in the cookie as a compact flag). */
export type ConsentRecord = {
  v: number;
  /** True only when every category was accepted (an "Accept all" choice). */
  all: boolean;
  cats: ConsentCategories;
  /** Epoch ms the choice was made. */
  ts: number;
};

/** Everything off (a fresh visitor, or an explicit "Reject all"). */
export const DENIED_CATEGORIES: ConsentCategories = {
  analytics: false,
  functional: false,
  targeting: false,
};

/** Everything on (an "Accept all" choice). */
export const GRANTED_CATEGORIES: ConsentCategories = {
  analytics: true,
  functional: true,
  targeting: true,
};

/** A Consent Mode signal value. */
type Signal = "granted" | "denied";

/** The full set of Consent Mode v2 signals we set on every update (security_storage stays granted). */
export type ConsentSignals = {
  ad_storage: Signal;
  ad_user_data: Signal;
  ad_personalization: Signal;
  analytics_storage: Signal;
  functionality_storage: Signal;
  personalization_storage: Signal;
};

/**
 * Map the user's category choices to the six Consent Mode v2 signals.
 * security_storage is omitted here because it is granted by default and never revoked.
 */
export function categoriesToSignals(cats: ConsentCategories): ConsentSignals {
  const g = (on: boolean): Signal => (on ? "granted" : "denied");
  return {
    analytics_storage: g(cats.analytics),
    ad_storage: g(cats.targeting),
    ad_user_data: g(cats.targeting),
    ad_personalization: g(cats.targeting),
    functionality_storage: g(cats.functional),
    personalization_storage: g(cats.functional),
  };
}

/** True when a stored record is the current version and is younger than the 365-day window. */
function isFresh(record: ConsentRecord): boolean {
  if (record.v !== CONSENT_VERSION) return false;
  if (typeof record.ts !== "number") return false;
  return Date.now() - record.ts < ONE_YEAR_MS;
}

/**
 * Read the stored consent choice. Returns null when there is no choice yet, the record is malformed,
 * the schema version changed, or it is older than 365 days (all of which mean "show the banner again").
 * SSR-safe: returns null on the server.
 */
export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (!parsed || typeof parsed !== "object" || !parsed.cats) return null;
    const record: ConsentRecord = {
      v: typeof parsed.v === "number" ? parsed.v : 0,
      all: parsed.all === true,
      cats: {
        analytics: parsed.cats.analytics === true,
        functional: parsed.cats.functional === true,
        targeting: parsed.cats.targeting === true,
      },
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
    };
    return isFresh(record) ? record : null;
  } catch {
    // localStorage blocked / corrupt JSON -> treat as no choice (banner shows, defaults stay denied).
    return null;
  }
}

/** Build the canonical record from a set of category choices. */
function buildRecord(cats: ConsentCategories): ConsentRecord {
  return {
    v: CONSENT_VERSION,
    all: cats.analytics && cats.functional && cats.targeting,
    cats: { ...cats },
    ts: Date.now(),
  };
}

/**
 * Persist a consent choice to localStorage AND the mirror cookie (365d; SameSite=Lax; Secure).
 * The cookie value is a compact flag string `v1:a1f0t0` so a future server read is cheap.
 * SSR-safe: no-ops on the server. Returns the record it wrote.
 */
export function writeConsent(cats: ConsentCategories): ConsentRecord {
  const record = buildRecord(cats);
  if (typeof window === "undefined") return record;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable - the cookie below still records the choice.
  }
  writeMirrorCookie(record);
  return record;
}

/** Compact, human-readable cookie flag, e.g. "v1:a1f0t1". */
function encodeCookie(record: ConsentRecord): string {
  const b = (on: boolean) => (on ? "1" : "0");
  return `v${record.v}:a${b(record.cats.analytics)}f${b(record.cats.functional)}t${b(
    record.cats.targeting,
  )}`;
}

function writeMirrorCookie(record: ConsentRecord): void {
  if (typeof document === "undefined") return;
  // Secure only over HTTPS; on http://localhost the Secure attribute would drop the cookie, so omit
  // it there. Production (siteiq.monkata.ai) is always HTTPS, so it is set in every real environment.
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeCookie(
    record,
  )}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Clear the stored choice (localStorage + cookie). SSR-safe. Useful for testing and a future
 * "reset my cookie preferences" action.
 */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

/** A minimal gtag shape so we can call it without pulling in any Google typings. */
type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

/**
 * Apply a set of category choices at runtime:
 *  1) `gtag('consent','update',{...})` so Google tags react immediately, and
 *  2) the two Dexinal-style dataLayer signals (`cookie_consent_given` + `consent_update`).
 *
 * SSR-safe and absent-GTM-safe: if `gtag`/`dataLayer` are missing (no NEXT_PUBLIC_GTM_ID, so the
 * bootstrap rendered nothing), this no-ops cleanly - the banner still records the choice via
 * writeConsent, it just has no Google tag to talk to. `action` labels the choice for analytics.
 */
export function applyConsentUpdate(
  cats: ConsentCategories,
  action: "accept_all" | "reject_all" | "custom",
): void {
  if (typeof window === "undefined") return;
  const w = window as GtagWindow;
  const signals = categoriesToSignals(cats);

  // 1) Consent Mode update (only when gtag exists - i.e. GTM is configured).
  if (typeof w.gtag === "function") {
    w.gtag("consent", "update", signals);
  }

  // 2) dataLayer signals (guarded; the bootstrap normally creates dataLayer first).
  if (Array.isArray(w.dataLayer)) {
    w.dataLayer.push({ event: "cookie_consent_given", consent_action: action });
    w.dataLayer.push({
      event: "consent_update",
      consent_analytics: signals.analytics_storage,
      consent_ad_storage: signals.ad_storage,
      consent_functionality: signals.functionality_storage,
    });
  }
}

/**
 * Global Privacy Control: a browser/extension signal that the user opts out of sale/sharing.
 * When true and there is no explicit stored choice, we treat targeting as off and do not pre-tick
 * analytics. SSR-safe.
 */
export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
