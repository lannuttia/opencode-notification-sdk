import { describe, it, expect } from "vitest";
import { loadConfig, getBackendConfig, parseConfigFile } from "../src/config.js";
import type { NotificationSDKConfig } from "../src/config.js";

const DEFAULT_CONFIG: NotificationSDKConfig = {
  enabled: true,
  cooldown: null,
  events: {
    "session.idle": { enabled: true },
    "session.error": { enabled: true },
    "permission.asked": { enabled: true },
  },
  templates: null,
  backends: {},
};

describe("loadConfig", () => {
  it("should return a valid config object (either defaults or from config file)", () => {
    // loadConfig reads from ~/.config/opencode/notification.json
    // If the file doesn't exist, it returns defaults; if it does, it parses it.
    // Either way, the result should have the correct shape.
    const config = loadConfig();
    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("cooldown");
    expect(config).toHaveProperty("events");
    expect(config).toHaveProperty("templates");
    expect(config).toHaveProperty("backends");
    expect(typeof config.enabled).toBe("boolean");
    // Should NOT have subagentNotifications
    expect(config).not.toHaveProperty("subagentNotifications");
  });
});

describe("parseConfigFile", () => {
  it("should parse a valid full config file", () => {
    const fileConfig = {
      enabled: false,
      cooldown: {
        duration: "PT5M",
        edge: "trailing",
      },
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
      backends: {
        ntfy: {
          topic: "my-topic",
          server: "https://ntfy.sh",
        },
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
    expect(config.cooldown).toBeNull();
    expect(config.events["session.idle"].enabled).toBe(true);
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.asked"].enabled).toBe(true);
    expect(config.templates).toBeNull();
    expect(config.backends).toEqual({});
    // Should NOT have subagentNotifications
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

  it("should use default cooldown edge when only duration is specified", () => {
    const partialConfig = {
      cooldown: { duration: "PT30S" },
    };
    const config = parseConfigFile(JSON.stringify(partialConfig));
    expect(config.cooldown).toEqual({
      duration: "PT30S",
      edge: "leading",
    });
  });

  it("should throw when cooldown.edge has an invalid value", () => {
    const invalidConfig = {
      cooldown: { duration: "PT30S", edge: "middle" },
    };
    expect(() => parseConfigFile(JSON.stringify(invalidConfig))).toThrow(/Invalid notification config/);
    expect(() => parseConfigFile(JSON.stringify(invalidConfig))).toThrow(/edge/);
  });
});

describe("getBackendConfig", () => {
  it("should return the backend-specific config section when it exists", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backends: {
        ntfy: { topic: "my-topic", server: "https://ntfy.sh" },
      },
    };

    const ntfyConfig = getBackendConfig(config, "ntfy");
    expect(ntfyConfig).toEqual({ topic: "my-topic", server: "https://ntfy.sh" });
  });

  it("should return undefined when the backend key does not exist", () => {
    const config: NotificationSDKConfig = {
      ...DEFAULT_CONFIG,
      backends: {},
    };

    const result = getBackendConfig(config, "nonexistent");
    expect(result).toBeUndefined();
  });
});
