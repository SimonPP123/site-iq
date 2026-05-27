/**
 * Open-redirect prevention for post-login navigation.
 *
 * This lives in its own module (no Node built-ins) so it can be imported by both server
 * code and `"use client"` components without pulling the crypto-backed helpers in
 * `security.ts` into the browser bundle.
 */

/**
 * Paths a `?redirect=` value is allowed to point at. "/" and "/audit" are the Site IQ landing
 * + report routes (the proxy sends logged-out users to `/login?redirect=/audit/<id>`); the rest
 * are foundation areas. "/" only ever matches exactly - its sub-path form is "//", which is
 * rejected as protocol-relative below.
 */
const ALLOWED_REDIRECT_PREFIXES = ["/", "/audit", "/audits", "/admin", "/account"];

/**
 * Validate a user-supplied redirect target, falling back to `defaultPath` when it isn't safe.
 * A value is accepted only if it is a relative path that exactly equals an allowed prefix or
 * is a sub-path of one (`prefix + "/"`). Matching on the segment boundary - not a bare
 * `startsWith` - is what stops path-confusion bypasses like `/administrator` slipping past `/admin`.
 */
export function validateRedirect(
    redirect: string | null,
    defaultPath: string = "/admin"
): string {
    if (!redirect) return defaultPath;
    // Must be a relative path, and not a protocol-relative URL (`//evil.com`).
    if (!redirect.startsWith("/")) return defaultPath;
    if (redirect.startsWith("//")) return defaultPath;

    const isAllowed = ALLOWED_REDIRECT_PREFIXES.some(
        (prefix) => redirect === prefix || redirect.startsWith(prefix + "/")
    );

    return isAllowed ? redirect : defaultPath;
}
