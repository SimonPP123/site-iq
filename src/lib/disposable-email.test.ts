import { describe, it, expect } from "vitest";
import { isDisposableEmail } from "./disposable-email";

describe("isDisposableEmail", () => {
  it("flags known disposable domains (case-insensitive)", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("X@Guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("a.b+tag@yopmail.com")).toBe(true);
  });
  it("allows normal providers and custom domains", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("ceo@acme.co")).toBe(false);
  });
  it("returns false for malformed input", () => {
    expect(isDisposableEmail("not-an-email")).toBe(false);
    expect(isDisposableEmail("")).toBe(false);
  });
});
