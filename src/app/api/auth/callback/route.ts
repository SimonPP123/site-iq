import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateRedirect } from "@/lib/redirect";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

/**
 * Supabase PKCE callback (OAuth, magic link, password recovery). MUST use the @supabase/ssr server
 * client so exchangeCodeForSession writes the session into response cookies - the previous raw
 * @supabase/supabase-js client exchanged the code but never persisted the session, silently logging
 * the user back out. The `next` target is validated (open-redirect safe) and defaults to /audits.
 */
export async function GET(request: NextRequest) {
  // IP-level rate limit: this endpoint exchanges a one-time code for a session, so cap how often a
  // single source can hit it to blunt code-guessing / replay floods before any Supabase work.
  const rl = await rateLimit("auth-callback:" + getClientIp(request.headers), 10, 60_000);
  if (!rl.success) {
    return NextResponse.redirect(new URL("/login?error=rate_limit", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = validateRedirect(url.searchParams.get("next"), "/audits");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchange failed:", error.message);
      return NextResponse.redirect(new URL("/login?error=auth", request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
