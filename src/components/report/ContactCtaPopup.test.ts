import { describe, it, expect } from "vitest";
import { shouldShowCtaPopup } from "./ContactCtaPopup";

/**
 * The popup's visibility is a pure predicate over four signals; the DOM/timer plumbing feeds it.
 * Testing the predicate pins the trigger rules: show ONLY after the reader scrolled down into the
 * report AND a dwell elapsed, and NEVER while the static CTA is on screen or after dismissal. The
 * scroll signal latches upstream, so "scrolled back to the top" still satisfies hasScrolledDown.
 */
const base = { hasScrolledDown: true, dwellElapsed: true, staticCtaVisible: false, dismissed: false };

describe("shouldShowCtaPopup", () => {
  it("shows once scrolled-down + dwelled, static CTA off-screen, not dismissed", () => {
    expect(shouldShowCtaPopup(base)).toBe(true);
  });
  it("stays hidden until the reader has scrolled down into the report", () => {
    expect(shouldShowCtaPopup({ ...base, hasScrolledDown: false })).toBe(false);
  });
  it("stays hidden until the dwell time has elapsed (give them time to explore)", () => {
    expect(shouldShowCtaPopup({ ...base, dwellElapsed: false })).toBe(false);
  });
  it("suppresses itself while the static bottom CTA is already visible (no double-nudge)", () => {
    expect(shouldShowCtaPopup({ ...base, staticCtaVisible: true })).toBe(false);
  });
  it("never re-shows after dismissal / click", () => {
    expect(shouldShowCtaPopup({ ...base, dismissed: true })).toBe(false);
  });
});
