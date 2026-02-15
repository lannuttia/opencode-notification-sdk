import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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

export function loadConfig(): NotificationSDKConfig {
  try {
    readFileSync(CONFIG_PATH, "utf-8");
    return createDefaultConfig();
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }
}
