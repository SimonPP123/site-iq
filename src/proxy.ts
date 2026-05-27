import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 entrypoint (Node.js runtime) - replaces the deprecated middleware.ts.
 * Refreshes the Supabase session and gates protected routes (/admin, /audit) via updateSession.
 *
 * Security headers (CSP, HSTS, X-Frame-Options, etc.) are NOT set here - they live in
 * next.config.ts `headers()` so Vercel applies them to every response, including statically-served
 * pages that middleware headers don't reliably reach.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
