/**
 * Minimal disposable / throwaway email-domain blocklist. Not exhaustive (a full list is thousands of
 * domains and churns constantly) - it covers the common providers to trim casual signup/contact
 * abuse. The durable abuse controls are the per-IP rate limit and the global daily audit cap.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "grr.la", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com", "tempmailo.com",
  "throwawaymail.com", "yopmail.com", "getnada.com", "nada.email", "dispostable.com",
  "fakeinbox.com", "trashmail.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "mohmal.com", "mailcatch.com", "spamgourmet.com", "tempr.email", "emailondeck.com",
  "mailtemp.net", "tmail.ws", "moakt.com", "inboxkitten.com", "burnermail.io", "temp-mail.io",
  "1secmail.com", "email-temp.com", "tmpmail.org", "discard.email", "spam4.me", "fakemail.net",
]);

/** True if the email's domain is a known disposable/throwaway provider. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
