// opencode-notification-sdk public API

// Plugin factory
export { createNotificationPlugin } from "./plugin-factory.js";

// Content utilities
export { renderTemplate, execCommand, execTemplate } from "./templates.js";

// Types
export type {
  NotificationBackend,
  NotificationContext,
  NotificationEvent,
  EventMetadata,
} from "./types.js";

// Configuration
export type { NotificationSDKConfig } from "./config.js";
export { loadConfig, getBackendConfig } from "./config.js";
