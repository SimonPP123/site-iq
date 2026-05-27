import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

/**
 * In-page admin authorization - defense-in-depth on top of the middleware gate. Every /admin server
 * page calls this before rendering or touching service-role data, so a middleware bypass (a matcher
 * edge case, a header trick, or a future refactor that moves a route) can never on its own leak the
 * admin UI or its data (e.g. all contact-form PII read via the service-role client).
 *
 * Calls notFound() (a 404 that does not reveal the admin area exists) for non-admins; returns the
 * verified JWT claims for admins.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims as { email?: string } | undefined)?.email;
  if (!isAdminEmail(email)) notFound();
  return data!.claims;
}
