// `validateRedirect` is a pure helper kept in its own (crypto-free) module so client
// components can use it too; re-exported here for back-compat with existing importers.
export { validateRedirect } from "./redirect";

/**
 * Sanitize an error for a client response. In development, surface the real message to aid
 * debugging; in production, return a generic message so internal details never leak.
 */
export function sanitizeErrorMessage(
    error: unknown,
    defaultMessage: string = "An error occurred"
): string {
    if (process.env.NODE_ENV === "development" && error instanceof Error) {
        return error.message;
    }
    return defaultMessage;
}

/**
 * Best-effort client IP from proxy headers. Prefer X-Vercel-Forwarded-For: Vercel sets it from the
 * real edge connection, so (unlike X-Forwarded-For) a client cannot spoof it to forge a different
 * rate-limit bucket. Fall back to X-Forwarded-For, then X-Real-IP for non-Vercel/local runs. Still
 * a rate-limit bucket only, NOT a trust boundary.
 */
export function getClientIp(headers: Headers): string {
    const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
    if (vercelForwardedFor) {
        return vercelForwardedFor.split(",")[0].trim();
    }

    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    const realIp = headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    return "unknown";
}

/**
 * Same-origin assertion for state-changing, cookie-authenticated routes - defense-in-depth CSRF
 * protection that does not rely solely on the implicit @supabase/ssr SameSite=Lax cookie default.
 *
 * Returns true when the request is safe to process:
 *  - `Sec-Fetch-Site` (sent by all modern browsers): allow `same-origin` and `none` (a direct
 *    navigation / typed URL), reject `cross-site` and `same-site` (a different subdomain).
 *  - else `Origin`: must match the request host.
 *  - else (neither header, e.g. a server-to-server or old non-browser client): allow - SameSite=Lax
 *    already blocks the cross-site cookie-bearing browser POST, so this is purely additive.
 *
 * Cheap, synchronous, no body read - call it first in every mutating route (audit/chat/delete).
 */
export function isSameOriginRequest(req: Request): boolean {
    const secFetchSite = req.headers.get("sec-fetch-site");
    if (secFetchSite) {
        return secFetchSite === "same-origin" || secFetchSite === "none";
    }
    const origin = req.headers.get("origin");
    if (origin) {
        try {
            const originHost = new URL(origin).host;
            const reqHost = req.headers.get("host") ?? new URL(req.url).host;
            return originHost === reqHost;
        } catch {
            return false; // malformed Origin -> reject
        }
    }
    return true; // no Origin/Sec-Fetch-Site (non-browser client) - Lax cookie already gates browsers
}
