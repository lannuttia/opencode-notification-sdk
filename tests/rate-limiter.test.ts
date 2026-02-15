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
});
