"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon/publishable key, RLS-scoped).
 * Carries the user's session, so authenticated reads resolve auth.uid() under RLS.
 * Used by client components (e.g. the Realtime audit-steps subscription).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
