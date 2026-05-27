/**
 * Check a password against the HaveIBeenPwned "Pwned Passwords" API using k-anonymity.
 *
 * We SHA-1 the password in the browser, send ONLY the first 5 hex chars of the hash to the range API,
 * and match the returned suffixes locally - the password itself (and its full hash) never leave the
 * device. Free, no API key. This is the same breached-password protection Supabase offers on its Pro
 * plan, implemented app-side so it works on the free tier.
 *
 * FAIL-OPEN: any network/crypto error returns `false` (do not block the user). Breach-checking is a
 * best-effort hardening layer on top of the length/strength rules in lib/password.ts - never a hard gate
 * that an outage could turn into a signup blocker.
 *
 * Requires `https://api.pwnedpasswords.com` in the CSP connect-src (see next.config.ts).
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    if (!password || typeof globalThis.crypto?.subtle?.digest !== "function") return false;

    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // "Add-Padding" makes HIBP pad the response with decoy (count 0) lines so the response size doesn't
    // leak how many real suffixes share this prefix. We ignore the count-0 padding lines below.
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix && Number(count) > 0) return true; // found in a real breach
    }
    return false;
  } catch {
    return false; // fail-open: never block signup/reset on an HIBP hiccup
  }
}
