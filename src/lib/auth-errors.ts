/**
 * Map a raw Supabase Auth error to friendly, app-consistent copy. Supabase returns terse server
 * strings (e.g. "Invalid login credentials", "User already registered") that can clash with our own
 * hints and look unpolished; show a clean message for the common cases and a safe generic fallback
 * otherwise. Never surfaces internal/identifying detail.
 */
export function authErrorMessage(err: { message?: string } | string | null | undefined): string {
  const raw = (typeof err === "string" ? err : err?.message ?? "").toLowerCase();
  if (!raw) return "Something went wrong. Please try again.";
  if (raw.includes("invalid login credentials") || raw.includes("invalid credentials"))
    return "That email or password is not correct.";
  if (raw.includes("email not confirmed"))
    return "Please confirm your email first - check your inbox for the confirmation link.";
  if (raw.includes("already registered") || raw.includes("already been registered") || raw.includes("user already"))
    return "An account with that email already exists - try signing in instead.";
  if (raw.includes("password") && raw.includes("different"))
    return "Your new password must be different from your current one.";
  if (raw.includes("password") && (raw.includes("at least") || raw.includes("should be") || raw.includes("weak") || raw.includes("characters")))
    return "Please choose a stronger password.";
  if (raw.includes("expired") || (raw.includes("token") && raw.includes("invalid")))
    return "That link has expired or is invalid - please request a new one.";
  if (raw.includes("rate") || raw.includes("too many"))
    return "Too many attempts - please wait a moment and try again.";
  if (raw.includes("network") || raw.includes("failed to fetch") || raw.includes("load failed"))
    return "Network problem - please check your connection and try again.";
  return "Something went wrong. Please try again.";
}
