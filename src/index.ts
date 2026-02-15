// opencode-notification-sdk public API

// Plugin factory
export { createNotificationPlugin } from "./plugin-factory.js";

// Types
export type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
  EventMetadata,
} from "./types.js";
export { NOTIFICATION_EVENTS } from "./types.js";

// Configuration
export type { NotificationSDKConfig } from "./config.js";
export { loadConfig, getBackendConfig, parseConfigFile } from "./config.js";

// Rate limiting
export type { RateLimiter, RateLimiterOptions } from "./rate-limiter.js";
export { parseISO8601Duration } from "./rate-limiter.js";
