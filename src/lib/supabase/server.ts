import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client (anon key + request cookies).
 * Use in Server Components and Route Handlers. Carries the user's session via
 * cookies, so RLS-scoped queries resolve auth.uid() correctly.
 * Next.js 16: cookies() is async and must be awaited.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (cannot set cookies) - safe to ignore:
            // the proxy refreshes and persists the session on every request.
          }
        },
      },
    },
  );
}
