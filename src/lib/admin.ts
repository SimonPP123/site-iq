/**
 * Admin gate. ADMIN_EMAILS is a comma-separated allowlist of admin emails. An empty/unset list means
 * NO admins (the /admin area and admin-only APIs are locked) - the safe default, so the internal panel
 * is never exposed to ordinary signed-in users until an admin email is explicitly set.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}
