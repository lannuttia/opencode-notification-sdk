import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { NOTIFICATION_EVENTS } from "./types.js";
import type { NotificationEvent } from "./types.js";

export interface EventConfig {
  enabled: boolean;
}

export interface CooldownConfig {
  duration: string;
  edge: "leading" | "trailing";
}

export interface TemplateConfig {
  titleCmd: string | null;
  messageCmd: string | null;
}

export interface NotificationSDKConfig {
  enabled: boolean;
  subagentNotifications: "always" | "never" | "separate";
  cooldown: CooldownConfig | null;
  events: Record<NotificationEvent, EventConfig>;
  templates: Record<string, TemplateConfig> | null;
  backends: Record<string, Record<string, unknown>>;
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
    subagentNotifications: "separate",
    cooldown: null,
    events: {
      "session.complete": { enabled: true },
      "subagent.complete": { enabled: true },
      "session.error": { enabled: true },
      "permission.requested": { enabled: true },
      "question.asked": { enabled: true },
    },
    templates: null,
    backends: {},
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationEvent(key: string): key is NotificationEvent {
  return (NOTIFICATION_EVENTS satisfies readonly string[]).includes(key);
}

function parseConfigFile(content: string): NotificationSDKConfig {
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

  const subagentNotifications =
    typeof parsed.subagentNotifications === "string"
      ? parsed.subagentNotifications
      : defaults.subagentNotifications;

  let cooldown: CooldownConfig | null = defaults.cooldown;
  if (parsed.cooldown === null) {
    cooldown = null;
  } else if (isRecord(parsed.cooldown)) {
    const duration =
      typeof parsed.cooldown.duration === "string"
        ? parsed.cooldown.duration
        : "";
    const edge =
      typeof parsed.cooldown.edge === "string" ? parsed.cooldown.edge : "leading";
    cooldown = {
      duration,
      edge: edge === "trailing" ? "trailing" : "leading",
    };
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

  let backends: Record<string, Record<string, unknown>> = defaults.backends;
  if (isRecord(parsed.backends)) {
    backends = {};
    for (const [key, val] of Object.entries(parsed.backends)) {
      if (isRecord(val)) {
        backends[key] = val;
      }
    }
  }

  return {
    enabled,
    subagentNotifications:
      subagentNotifications === "always" ||
      subagentNotifications === "never" ||
      subagentNotifications === "separate"
        ? subagentNotifications
        : defaults.subagentNotifications,
    cooldown,
    events,
    templates,
    backends,
  };
}

export function loadConfig(): NotificationSDKConfig {
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return parseConfigFile(content);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }
}
