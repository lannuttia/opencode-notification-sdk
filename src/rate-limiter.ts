import { parse, toSeconds } from "iso8601-duration";
import { throttle, debounce } from "throttle-debounce";

/**
 * Parse an ISO 8601 duration string and return the equivalent value in milliseconds.
 *
 * @param duration - An ISO 8601 duration string (e.g., `"PT30S"`, `"PT5M"`, `"PT1H"`).
 * @returns The duration in milliseconds.
 */
export function parseISO8601Duration(duration: string): number {
  const parsed = parse(duration);
  return toSeconds(parsed) * 1000;
}

/**
 * Options for creating a {@link RateLimiter}.
 */
export interface RateLimiterOptions {
  /** ISO 8601 duration string specifying the cooldown period. */
  duration: string;
  /**
   * Which edge of the cooldown window triggers the notification:
   * - `"leading"` — throttle: first event fires immediately, subsequent suppressed
   * - `"trailing"` — debounce: fires after a quiet period
   */
  edge: "leading" | "trailing";
}

/**
 * A stateful per-event-type rate limiter.
 *
 * Each canonical event type has an independent cooldown timer. When cooldown
 * is zero (`PT0S`), rate limiting is disabled and all events are allowed.
 */
export interface RateLimiter {
  /**
   * Check whether a notification for the given event type should be allowed.
   *
   * @param eventType - The canonical event type string (e.g., `"session.complete"`).
   * @returns `true` if the notification should be sent, `false` if rate-limited.
   */
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

/**
 * Create a stateful rate limiter for per-event-type notification cooldowns.
 *
 * A cooldown of `PT0S` (zero seconds) disables rate limiting, allowing all
 * events through. Rate limiting is tracked independently per canonical event type.
 *
 * @param options - The rate limiter configuration (duration and edge type).
 * @returns A {@link RateLimiter} instance.
 */
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
