import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseISO8601Duration, createRateLimiter } from "../src/rate-limiter.js";

describe("parseISO8601Duration", () => {
  it("should parse PT30S to 30000 milliseconds", () => {
    expect(parseISO8601Duration("PT30S")).toBe(30000);
  });

  it("should parse PT5M to 300000 milliseconds", () => {
    expect(parseISO8601Duration("PT5M")).toBe(300000);
  });
});

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("with zero duration (PT0S)", () => {
    it("should always allow events when duration is zero", () => {
      const limiter = createRateLimiter({ duration: "PT0S", edge: "leading" });
      expect(limiter.shouldAllow("session.complete")).toBe(true);
      expect(limiter.shouldAllow("session.complete")).toBe(true);
      expect(limiter.shouldAllow("session.complete")).toBe(true);
    });
  });

  describe("with leading edge", () => {
    it("should allow the first call and deny subsequent calls within cooldown", () => {
      const limiter = createRateLimiter({ duration: "PT30S", edge: "leading" });

      // First call should be allowed (leading edge fires immediately)
      expect(limiter.shouldAllow("session.complete")).toBe(true);

      // Immediate subsequent calls should be denied
      expect(limiter.shouldAllow("session.complete")).toBe(false);
      expect(limiter.shouldAllow("session.complete")).toBe(false);

      // After cooldown expires, next call should be allowed
      // Note: throttle-debounce uses strict > comparison, so we advance past the delay
      vi.advanceTimersByTime(30001);
      expect(limiter.shouldAllow("session.complete")).toBe(true);

      // And again denied within the new cooldown window
      expect(limiter.shouldAllow("session.complete")).toBe(false);
    });
  });

  describe("with trailing edge", () => {
    it("should deny initial calls and allow after quiet period", () => {
      const limiter = createRateLimiter({ duration: "PT10S", edge: "trailing" });

      // First call should be denied (trailing edge waits for quiet period)
      expect(limiter.shouldAllow("session.complete")).toBe(false);

      // More calls during the burst should also be denied
      expect(limiter.shouldAllow("session.complete")).toBe(false);

      // After the debounce period elapses (quiet period), the debounce callback fires
      vi.advanceTimersByTime(10001);

      // The next call after the quiet period should be allowed
      expect(limiter.shouldAllow("session.complete")).toBe(true);

      // Subsequent immediate calls should be denied again (new debounce cycle)
      expect(limiter.shouldAllow("session.complete")).toBe(false);
    });
  });

  describe("per-event-type independence", () => {
    it("should track cooldowns independently for different event types", () => {
      const limiter = createRateLimiter({ duration: "PT30S", edge: "leading" });

      // First call for session.complete should be allowed
      expect(limiter.shouldAllow("session.complete")).toBe(true);

      // session.complete is now in cooldown, but session.error should be independent
      expect(limiter.shouldAllow("session.error")).toBe(true);

      // Both should now be in cooldown
      expect(limiter.shouldAllow("session.complete")).toBe(false);
      expect(limiter.shouldAllow("session.error")).toBe(false);

      // After cooldown, both should be allowed again
      vi.advanceTimersByTime(30001);
      expect(limiter.shouldAllow("session.complete")).toBe(true);
      expect(limiter.shouldAllow("session.error")).toBe(true);
    });
  });
});
