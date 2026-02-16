import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, getBackendConfig, parseConfigFile, getConfigPath } from "../src/config.js";
import type { NotificationSDKConfig } from "../src/config.js";

const DEFAULT_CONFIG: NotificationSDKConfig = {
  enabled: true,
  events: {
    "session.idle": { enabled: true },
    "session.error": { enabled: true },
    "permission.asked": { enabled: true },
  },
  templates: null,
  backend: {},
};

describe("loadConfig", () => {
  it("should return a valid config object (either defaults or from config file)", () => {
    // loadConfig reads from ~/.config/opencode/notification.json (or notification-<key>.json)
    // If the file doesn't exist, it returns defaults; if it does, it parses it.
    // Either way, the result should have the correct shape.
    const config = loadConfig();
    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("events");
    expect(config).toHaveProperty("templates");
    expect(config).toHaveProperty("backend");
    expect(typeof config.enabled).toBe("boolean");
    // Should NOT have backends (plural) or subagentNotifications
    expect(config).not.toHaveProperty("backends");
    expect(config).not.toHaveProperty("subagentNotifications");
  });

  it("should accept an optional backendConfigKey parameter and return valid config", () => {
    // When backendConfigKey is provided, loadConfig reads from
    // ~/.config/opencode/notification-<key>.json instead of notification.json.
    // Since the file likely doesn't exist, we expect defaults.
    const config = loadConfig("nonexistent-backend-key");
    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("backend");
    expect(config.enabled).toBe(true);
    expect(config.backend).toEqual({});
  });
});

describe("getConfigPath", () => {
  it("should return notification.json path when no backendConfigKey is provided", () => {
    const expected = join(homedir(), ".config", "opencode", "notification.json");
    expect(getConfigPath()).toBe(expected);
  });

  it("should return notification-<key>.json path when backendConfigKey is provided", () => {
    const expected = join(homedir(), ".config", "opencode", "notification-ntfy.json");
    expect(getConfigPath("ntfy")).toBe(expected);
  });

  it("should return notification-<key>.json path for desktop key", () => {
    const expected = join(homedir(), ".config", "opencode", "notification-desktop.json");
    expect(getConfigPath("desktop")).toBe(expected);
  });
});

describe("parseConfigFile", () => {
  it("should parse a valid full config file with singular backend key", () => {
    const fileConfig = {
      enabled: false,
      events: {
        "session.idle": { enabled: true },
        "session.error": { enabled: true },
        "permission.asked": { enabled: false },
      },
      templates: {
        "session.idle": {
          titleCmd: "echo 'Done'",
          messageCmd: null,
        },
      },
      backend: {
        topic: "my-topic",
        server: "https://ntfy.sh",
      },
    };

    const config = parseConfigFile(JSON.stringify(fileConfig));
    expect(config).toEqual(fileConfig);
  });

  it("should throw a descriptive error when config file contains malformed JSON", () => {
    expect(() => parseConfigFile("{ not valid json }}}")).toThrow(/Invalid notification config/);
  });

  it("should merge partial config with defaults", () => {
    const partialConfig = { enabled: false };
    const config = parseConfigFile(JSON.stringify(partialConfig));
    expect(config.enabled).toBe(false);
    expect(config.events["session.idle"].enabled).toBe(true);
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.asked"].enabled).toBe(true);
    expect(config.templates).toBeNull();
    expect(config.backend).toEqual({});
    // Should NOT have backends (plural) or subagentNotifications
    expect(config).not.toHaveProperty("backends");
    expect(config).not.toHaveProperty("subagentNotifications");
  });

  it("should merge partial events config with defaults, preserving unspecified events", () => {
    const partialConfig = {
      events: {
        "session.idle": { enabled: false },
      },
    };
    const config = parseConfigFile(JSON.stringify(partialConfig));
    expect(config.events["session.idle"].enabled).toBe(false);
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.asked"].enabled).toBe(true);
  });

});

describe("getBackendConfig", () => {
  it("should return the backend config object directly from config.backend", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backend: { topic: "my-topic", server: "https://ntfy.sh" },
    };

    const backendConfig = getBackendConfig(config);
    expect(backendConfig).toEqual({ topic: "my-topic", server: "https://ntfy.sh" });
  });

  it("should return empty object when no backend config is set", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backend: {},
    };

    const result = getBackendConfig(config);
    expect(result).toEqual({});
  });
});
