/**
 * Normalize + validate a user-entered website into a bare domain + root URL, or a clear error.
 *
 * Pure + dependency-free so BOTH the client (instant inline feedback on the landing form) and the
 * server (the /api/audit gate) use the exact same rules - a user who types "asdf", "stripe"
 * (no TLD), "localhost", "1.2.3.4", or "ftp://x" gets a precise message instead of a 2-minute audit
 * that just fails.
 */
export type DomainResult = { ok: true; domain: string; rootUrl: string } | { ok: false; error: string };

export function normalizeDomain(input: string): DomainResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a website domain to audit." };
  if (raw.length > 253) return { ok: false, error: "That domain is too long." };

  // Allow a bare domain or an http(s) URL; reject other schemes (ftp:, javascript:, etc.).
  let withScheme = raw;
  if (/^https?:\/\//i.test(raw)) {
    /* keep as-is */
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return { ok: false, error: "Only http(s) websites are supported - try a domain like example.com." };
  } else {
    withScheme = `https://${raw}`;
  }

  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "That does not look like a valid domain. Try example.com." };
  }
  host = host.replace(/^www\./, "");
  if (!host) return { ok: false, error: "Enter a valid domain like example.com." };

  // We audit public websites by name, not raw IPs or internal hosts.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return { ok: false, error: "Enter a domain name (e.g. example.com), not an IP address." };
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, error: "Enter a public website domain (e.g. example.com)." };
  }

  const labels = host.split(".");
  if (labels.length < 2) {
    return { ok: false, error: "Enter a full domain with an ending, like example.com." };
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld) && !/^xn--[a-z0-9]+$/.test(tld)) {
    return { ok: false, error: "That domain ending doesn't look valid (try .com, .io, .org, …)." };
  }
  const labelOk = (l: string) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith("-") && !l.endsWith("-");
  if (!labels.every(labelOk)) {
    return { ok: false, error: "That does not look like a valid domain. Try example.com." };
  }

  return { ok: true, domain: host, rootUrl: `https://${host}` };
}
