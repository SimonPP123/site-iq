import "server-only";
import { isIP } from "node:net";

/**
 * SSRF guard: is a resolved IP address in a private, loopback, link-local, CGNAT, multicast, or
 * otherwise non-public range?
 *
 * Site IQ fetches a user-supplied website server-side (via n8n). normalizeDomain() already rejects
 * literal IPs and `localhost`, but a *public hostname* can still resolve to an internal address -
 * e.g. an attacker points `evil.example.com` at `169.254.169.254` (cloud metadata) or `127.0.0.1`.
 * /api/audit resolves the host and refuses the audit when any resolved address is non-public.
 *
 * Pure + dependency-free (only node:net for IP-family detection) so it is unit-tested in isolation.
 * Fails closed: anything that isn't a parseable, provably-public address is treated as unsafe.
 */
export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true; // not a parseable IP -> unsafe
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // "this" network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a >= 224) return true; // multicast (224/4), reserved (240/4), broadcast
  return false;
}

function isPrivateV6(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::") return true; // loopback / unspecified
  // IPv4-mapped / -compatible (e.g. ::ffff:127.0.0.1) - judge by the embedded IPv4.
  const mapped = a.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (/^fe[89ab]/.test(a)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(a)) return true; // fc00::/7 unique-local (fc.. / fd..)
  return false;
}
