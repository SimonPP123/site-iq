/**
 * Tests for the SSRF IP guard. These lock the ranges that /api/audit refuses to crawl, so a public
 * hostname that resolves to an internal address (the classic SSRF / DNS-rebinding vector) is blocked.
 */
import { describe, it, expect } from "vitest";
import { isPrivateIp } from "./ssrf";

describe("isPrivateIp", () => {
  describe("blocks non-public IPv4", () => {
    const blocked = [
      "127.0.0.1", // loopback
      "10.0.0.1", // private
      "10.255.255.255",
      "172.16.0.1", // private
      "172.31.255.255",
      "192.168.1.1", // private
      "169.254.169.254", // cloud metadata (the headline SSRF target)
      "169.254.0.1", // link-local
      "100.64.0.1", // CGNAT
      "0.0.0.0", // "this" network
      "224.0.0.1", // multicast
      "255.255.255.255", // broadcast
    ];
    for (const ip of blocked) {
      it(`blocks ${ip}`, () => expect(isPrivateIp(ip)).toBe(true));
    }
  });

  describe("allows public IPv4", () => {
    const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.15.255.255", "172.32.0.1", "192.167.0.1"];
    for (const ip of allowed) {
      it(`allows ${ip}`, () => expect(isPrivateIp(ip)).toBe(false));
    }
  });

  describe("blocks non-public IPv6 (incl. IPv4-mapped)", () => {
    const blocked = ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"];
    for (const ip of blocked) {
      it(`blocks ${ip}`, () => expect(isPrivateIp(ip)).toBe(true));
    }
  });

  it("allows public IPv6", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false); // Cloudflare DNS
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("fails closed on garbage input", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
    expect(isPrivateIp("999.999.999.999")).toBe(true);
  });
});
