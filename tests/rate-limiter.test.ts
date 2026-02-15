import { describe, it, expect } from "vitest";
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
  describe("with zero duration (PT0S)", () => {
    it("should always allow events when duration is zero", () => {
      const limiter = createRateLimiter({ duration: "PT0S", edge: "leading" });
      expect(limiter.shouldAllow("session.complete")).toBe(true);
      expect(limiter.shouldAllow("session.complete")).toBe(true);
      expect(limiter.shouldAllow("session.complete")).toBe(true);
    });
  });
});
