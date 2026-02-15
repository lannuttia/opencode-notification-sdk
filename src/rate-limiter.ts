import { parse, toSeconds } from "iso8601-duration";
import { throttle, debounce } from "throttle-debounce";

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

function createLeadingRateLimiter(durationMs: number): RateLimiter {
  const throttledFns = new Map<string, () => void>();
  let allowed = false;

  function getThrottledFn(eventType: string): () => void {
    const existing = throttledFns.get(eventType);
    if (existing) {
      return existing;
    }
    const fn = throttle(durationMs, () => {
      allowed = true;
    }, { noTrailing: true });
    throttledFns.set(eventType, fn);
    return fn;
  }

  return {
    shouldAllow(eventType: string): boolean {
      allowed = false;
      const fn = getThrottledFn(eventType);
      fn();
      return allowed;
    },
  };
}

function createTrailingRateLimiter(durationMs: number): RateLimiter {
  const pendingFire = new Map<string, boolean>();
  const debouncedFns = new Map<string, () => void>();

  function getDebouncedFn(eventType: string): () => void {
    const existing = debouncedFns.get(eventType);
    if (existing) {
      return existing;
    }
    const fn = debounce(durationMs, () => {
      pendingFire.set(eventType, true);
    });
    debouncedFns.set(eventType, fn);
    return fn;
  }

  return {
    shouldAllow(eventType: string): boolean {
      const fired = pendingFire.get(eventType) === true;
      if (fired) {
        pendingFire.set(eventType, false);
      }
      const fn = getDebouncedFn(eventType);
      fn();
      return fired;
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const durationMs = parseISO8601Duration(options.duration);

  if (durationMs === 0) {
    return {
      shouldAllow: () => true,
    };
  }

  if (options.edge === "leading") {
    return createLeadingRateLimiter(durationMs);
  }

  return createTrailingRateLimiter(durationMs);
}
