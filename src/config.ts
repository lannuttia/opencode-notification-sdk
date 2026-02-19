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

/**
 * Full configuration schema for the notification SDK.
 *
 * Loaded from `~/.config/opencode/notification-<backendConfigKey>.json`
 * (or `~/.config/opencode/notification.json` when no key is provided).
 * When the config file does not exist, all defaults are used (everything
 * enabled, empty backend config).
 */
export interface NotificationSDKConfig {
  /** Global kill switch for all notifications. Defaults to `true`. */
  enabled: boolean;
  /** Per-event enable/disable toggles. All events are enabled by default. */
  events: Record<NotificationEvent, EventConfig>;
  /** Backend-specific configuration for this plugin. */
  backend: Record<string, unknown>;
}

/**
 * Compute the config file path for a given backend config key.
 *
 * When `backendConfigKey` is provided, the path is
 * `~/.config/opencode/notification-<backendConfigKey>.json`.
 * When omitted, falls back to `~/.config/opencode/notification.json`.
 *
 * @param backendConfigKey - Optional key identifying the backend plugin.
 * @returns The absolute path to the config file.
 */
export function getConfigPath(backendConfigKey?: string): string {
  const filename =
    backendConfigKey != null
      ? `notification-${backendConfigKey}.json`
      : "notification.json";
  return join(homedir(), ".config", "opencode", filename);
}

/**
 * Perform variable substitution on a single string value.
 *
 * Replaces `{env:VAR_NAME}` placeholders with the corresponding environment
 * variable value (or empty string if not set), and `{file:path}` placeholders
 * with the trimmed contents of the specified file (or empty string if
 * unreadable). File paths may be absolute, home-relative (`~`), or relative
 * to `configDir`.
 *
 * @param value - The string to perform substitutions on.
 * @param configDir - The directory of the config file, used to resolve relative file paths.
 * @returns The string with all placeholders replaced.
 */
export function substituteString(value: string, configDir: string): string {
  const envSubstituted = value.replace(/\{env:([^}]+)\}/g, (_match: string, varName: string): string => {
    return process.env[varName] ?? "";
  });
  return envSubstituted.replace(/\{file:([^}]+)\}/g, (_match: string, filePath: string): string => {
    const resolvedPath = filePath.startsWith("/")
      ? filePath
      : join(configDir, filePath);
    try {
      return readFileSync(resolvedPath, "utf-8").trim();
    } catch {
      return "";
    }
  });
}

function createDefaultConfig(): NotificationSDKConfig {
  return {
    enabled: true,
    events: {
      "session.idle": { enabled: true },
      "session.error": { enabled: true },
      "permission.asked": { enabled: true },
    },
    backend: {},
  };
}

/**
 * Parse a JSON config string into a validated {@link NotificationSDKConfig}.
 *
 * Applies defaults for any missing fields.
 *
 * @param content - The raw JSON string to parse.
 * @returns The parsed and validated configuration object with defaults applied.
 * @throws {Error} If the JSON is malformed.
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

  const events = { ...defaults.events };
  if (isRecord(parsed.events)) {
    for (const key of NOTIFICATION_EVENTS) {
      const eventVal = parsed.events[key];
      if (isRecord(eventVal) && typeof eventVal.enabled === "boolean") {
        events[key] = {
          enabled: eventVal.enabled,
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
    events,
    backend,
  };
}

/**
 * Load the notification SDK configuration from the appropriate config file.
 *
 * When `backendConfigKey` is provided, reads from
 * `~/.config/opencode/notification-<backendConfigKey>.json`.
 * When omitted, reads from `~/.config/opencode/notification.json`.
 *
 * If the config file does not exist, returns an all-defaults configuration
 * (everything enabled, empty backend config).
 * If the file exists but contains invalid JSON or invalid config values,
 * throws an error.
 *
 * @param backendConfigKey - Optional key identifying the backend plugin,
 *   used to determine the config file path.
 * @returns The loaded and validated configuration with defaults applied.
 * @throws {Error} If the config file exists but contains malformed JSON or invalid values.
 */
export function loadConfig(backendConfigKey?: string): NotificationSDKConfig {
  const configPath = getConfigPath(backendConfigKey);
  try {
    const content = readFileSync(configPath, "utf-8");
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
 * @param backendName - The name of the backend whose config to extract.
 * @returns The backend config object.
 */
export function getBackendConfig(
  config: NotificationSDKConfig,
  backendName: string,
): Record<string, unknown> {
  void backendName;
  return config.backend;
}
