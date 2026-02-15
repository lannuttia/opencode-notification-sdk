import { parse, toSeconds } from "iso8601-duration";

export function parseISO8601Duration(duration: string): number {
  const parsed = parse(duration);
  return toSeconds(parsed) * 1000;
}

export interface RateLimiterOptions {
  duration: string;
  edge: "leading" | "trailing";
}

export interface RateLimiter {
  shouldAllow(eventType: string): boolean;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const durationMs = parseISO8601Duration(options.duration);

  if (durationMs === 0) {
    return {
      shouldAllow: () => true,
    };
  }

  return {
    shouldAllow: () => true,
  };
}
