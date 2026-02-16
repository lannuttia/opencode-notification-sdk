import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { NOTIFICATION_EVENTS, isRecord } from "./types.js";
import type { NotificationEvent } from "./types.js";

/** Per-event enable/disable toggle configuration. */
export interface EventConfig {
  /** Whether this event type triggers notifications. */
  enabled: boolean;
}

/** Rate limiting configuration for notification cooldowns. */
export interface CooldownConfig {
  /** ISO 8601 duration string (e.g., `"PT30S"`, `"PT5M"`). */
  duration: string;
  /** Which edge of the cooldown window triggers: `"leading"` (throttle) or `"trailing"` (debounce). */
  edge: "leading" | "trailing";
}

/** Per-event shell command template configuration for customizing notification content. */
export interface TemplateConfig {
  /** Shell command to generate the notification title, or `null` for the default. */
  titleCmd: string | null;
  /** Shell command to generate the notification message, or `null` for the default. */
  messageCmd: string | null;
}

/**
 * Full configuration schema for the notification SDK.
 *
 * Loaded from `~/.config/opencode/notification-<backendConfigKey>.json`
 * (or `~/.config/opencode/notification.json` when no key is provided).
 * When the config file does not exist, all defaults are used (everything
 * enabled, no cooldown, no templates, empty backend config).
 */
export interface NotificationSDKConfig {
  /** Global kill switch for all notifications. Defaults to `true`. */
  enabled: boolean;
  /** Rate limiting configuration, or `null` to disable rate limiting. Defaults to `null`. */
  cooldown: CooldownConfig | null;
  /** Per-event enable/disable toggles. All events are enabled by default. */
  events: Record<NotificationEvent, EventConfig>;
  /** Per-event shell command templates for customizing notification content, or `null` for defaults. */
  templates: Record<string, TemplateConfig> | null;
  /** Backend-specific configuration for this plugin. */
  backend: Record<string, unknown>;
}

const CONFIG_PATH = join(
  homedir(),
  ".config",
  "opencode",
  "notification.json",
);

function createDefaultConfig(): NotificationSDKConfig {
  return {
    enabled: true,
    cooldown: null,
    events: {
      "session.idle": { enabled: true },
      "session.error": { enabled: true },
      "permission.asked": { enabled: true },
    },
    templates: null,
    backend: {},
  };
}

const NOTIFICATION_EVENT_SET: Set<string> = new Set(NOTIFICATION_EVENTS);

function isNotificationEvent(key: string): key is NotificationEvent {
  return NOTIFICATION_EVENT_SET.has(key);
}

const VALID_EDGES: Set<string> = new Set(["leading", "trailing"]);
type CooldownEdge = "leading" | "trailing";

function isValidEdge(value: string): value is CooldownEdge {
  return VALID_EDGES.has(value);
}

/**
 * Parse a JSON config string into a validated {@link NotificationSDKConfig}.
 *
 * Applies defaults for any missing fields and validates enum values
 * (`cooldown.edge`).
 *
 * @param content - The raw JSON string to parse.
 * @returns The parsed and validated configuration object with defaults applied.
 * @throws {Error} If the JSON is malformed or contains invalid enum values.
 */
export function parseConfigFile(content: string): NotificationSDKConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid notification config: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Invalid notification config: expected a JSON object");
  }

  const defaults = createDefaultConfig();

  const enabled =
    typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled;

  let cooldown: CooldownConfig | null = defaults.cooldown;
  if (parsed.cooldown === null) {
    cooldown = null;
  } else if (isRecord(parsed.cooldown)) {
    const duration =
      typeof parsed.cooldown.duration === "string"
        ? parsed.cooldown.duration
        : "";

    let edge: CooldownEdge = "leading";
    if (typeof parsed.cooldown.edge === "string") {
      if (!isValidEdge(parsed.cooldown.edge)) {
        throw new Error(
          `Invalid notification config: cooldown.edge must be one of ${[...VALID_EDGES].join(", ")}, got "${parsed.cooldown.edge}"`,
        );
      }
      edge = parsed.cooldown.edge;
    }

    cooldown = { duration, edge };
  }

  const events = { ...defaults.events };
  if (isRecord(parsed.events)) {
    for (const key of Object.keys(events)) {
      if (!isNotificationEvent(key)) {
        continue;
      }
      const eventVal = parsed.events[key];
      if (isRecord(eventVal) && typeof eventVal.enabled === "boolean") {
        events[key] = {
          enabled: eventVal.enabled,
        };
      }
    }
  }

  let templates: Record<string, TemplateConfig> | null = defaults.templates;
  if (parsed.templates === null) {
    templates = null;
  } else if (isRecord(parsed.templates)) {
    templates = {};
    for (const [key, val] of Object.entries(parsed.templates)) {
      if (isRecord(val)) {
        templates[key] = {
          titleCmd:
            typeof val.titleCmd === "string" ? val.titleCmd : null,
          messageCmd:
            typeof val.messageCmd === "string" ? val.messageCmd : null,
        };
      }
    }
  }

  let backend: Record<string, unknown> = defaults.backend;
  if (isRecord(parsed.backend)) {
    backend = { ...parsed.backend };
  }

  return {
    enabled,
    cooldown,
    events,
    templates,
    backend,
  };
}

/**
 * Load the notification SDK configuration from `~/.config/opencode/notification.json`.
 *
 * If the config file does not exist, returns an all-defaults configuration
 * (everything enabled, no cooldown, no templates). If the file exists but
 * contains invalid JSON or invalid config values, throws an error.
 *
 * @returns The loaded and validated configuration with defaults applied.
 * @throws {Error} If the config file exists but contains malformed JSON or invalid values.
 */
export function loadConfig(): NotificationSDKConfig {
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return parseConfigFile(content);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }
}

/**
 * Extract the backend-specific configuration from the full SDK config.
 *
 * The SDK does not interpret or validate the backend config — it is passed
 * through as-is for the backend plugin to consume.
 *
 * @param config - The full notification SDK configuration.
 * @returns The backend config object.
 */
export function getBackendConfig(
  config: NotificationSDKConfig,
): Record<string, unknown> {
  return config.backend;
}
