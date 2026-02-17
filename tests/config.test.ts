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

  it("should throw when JSON is a valid array instead of an object", () => {
    expect(() => parseConfigFile(JSON.stringify([1, 2, 3]))).toThrow(
      /expected a JSON object/,
    );
  });

  it("should throw when JSON is a valid string instead of an object", () => {
    expect(() => parseConfigFile(JSON.stringify("hello"))).toThrow(
      /expected a JSON object/,
    );
  });

  it("should throw when JSON is a valid number instead of an object", () => {
    expect(() => parseConfigFile(JSON.stringify(42))).toThrow(
      /expected a JSON object/,
    );
  });

  it("should throw when JSON is null", () => {
    expect(() => parseConfigFile(JSON.stringify(null))).toThrow(
      /expected a JSON object/,
    );
  });

  it("should fall back to default enabled (true) when enabled field is a string", () => {
    const config = parseConfigFile(JSON.stringify({ enabled: "yes" }));
    expect(config.enabled).toBe(true);
  });

  it("should fall back to default enabled (true) when enabled field is a number", () => {
    const config = parseConfigFile(JSON.stringify({ enabled: 1 }));
    expect(config.enabled).toBe(true);
  });

  it("should use default when an event entry is a non-record value (string)", () => {
    const config = parseConfigFile(
      JSON.stringify({
        events: {
          "session.idle": "invalid",
        },
      }),
    );
    expect(config.events["session.idle"].enabled).toBe(true);
  });

  it("should use default when an event entry has a non-boolean enabled field", () => {
    const config = parseConfigFile(
      JSON.stringify({
        events: {
          "session.idle": { enabled: "not-a-boolean" },
        },
      }),
    );
    expect(config.events["session.idle"].enabled).toBe(true);
  });

  it("should fall back to empty backend when backend field is a string", () => {
    const config = parseConfigFile(
      JSON.stringify({ backend: "invalid" }),
    );
    expect(config.backend).toEqual({});
  });

  it("should fall back to empty backend when backend field is an array", () => {
    const config = parseConfigFile(
      JSON.stringify({ backend: [1, 2, 3] }),
    );
    expect(config.backend).toEqual({});
  });

});

describe("getBackendConfig", () => {
  it("should accept config and backendName parameters and return the backend config", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backend: { topic: "my-topic", server: "https://ntfy.sh" },
    };

    const backendConfig = getBackendConfig(config, "ntfy");
    expect(backendConfig).toEqual({ topic: "my-topic", server: "https://ntfy.sh" });
  });

  it("should return empty object when no backend config is set", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backend: {},
    };

    const result = getBackendConfig(config, "ntfy");
    expect(result).toEqual({});
  });

  it("should have a function length of 2 (config and backendName parameters)", () => {
    expect(getBackendConfig.length).toBe(2);
  });
});
