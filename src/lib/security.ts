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
