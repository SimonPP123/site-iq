import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client - bypasses RLS. SERVER-ONLY (the `server-only` import makes it a
 * build error to pull this into a client bundle). Use strictly in trusted, admin-gated server code
 * (e.g. the admin contact inbox reading contact_requests, which has no public SELECT policy).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
