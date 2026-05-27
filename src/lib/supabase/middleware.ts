import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateRedirect } from "@/lib/redirect";
import { isAdminEmail } from "@/lib/admin";

/**
 * Refresh the Supabase session on every request and gate protected routes.
 * Called from src/proxy.ts (Next.js 16 entrypoint, Node runtime).
 *
 * Reports are owner-scoped by RLS (reports.user_id = auth.uid()), so creating
 * or viewing an audit requires an authenticated session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // CRITICAL: do not run any code between createServerClient and getClaims().
  // getClaims() validates the JWT locally; never use getSession() for trust decisions.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/audit") ||
    pathname.startsWith("/account");
  const isAuthPage =
    pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // /admin is admin-only (ADMIN_EMAILS allowlist). A signed-in non-admin is sent to their audits,
  // so the internal panel is never exposed to ordinary users.
  if (user && pathname.startsWith("/admin")) {
    const email = (user as { email?: string }).email;
    if (!isAdminEmail(email)) return NextResponse.redirect(new URL("/audits", request.url));
  }

  // Already signed in but on an auth page (/login, /signup, /forgot-password): send them into the
  // app instead of showing a sign-in/sign-up form. Honor a safe ?redirect=, else go to /audits.
  if (user && isAuthPage) {
    const dest = validateRedirect(request.nextUrl.searchParams.get("redirect"), "/audits");
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Return THIS response (carries refreshed session cookies) - do not build a fresh one.
  return supabaseResponse;
}
