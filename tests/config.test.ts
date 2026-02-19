import { describe, it, expect, afterAll } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadConfig, getBackendConfig, parseConfigFile, getConfigPath, substituteString, substituteVariables } from "../src/config.js";
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

  it("should perform variable substitution on string values before validation", () => {
    process.env["TEST_PARSE_TOPIC"] = "my-ntfy-topic";
    const fileConfig = {
      backend: {
        topic: "{env:TEST_PARSE_TOPIC}",
      },
    };
    const config = parseConfigFile(JSON.stringify(fileConfig), "/tmp");
    delete process.env["TEST_PARSE_TOPIC"];
    expect(config.backend.topic).toBe("my-ntfy-topic");
  });

  it("should ignore unrecognized event keys and preserve defaults for known events", () => {
    const config = parseConfigFile(
      JSON.stringify({
        events: {
          "session.idle": { enabled: false },
          "foo.bar": { enabled: true },
          "unknown.event": { enabled: false },
        },
      }),
    );
    // Known event should be updated
    expect(config.events["session.idle"].enabled).toBe(false);
    // Other known events should retain defaults
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.asked"].enabled).toBe(true);
    // Unrecognized keys should NOT appear in the result
    expect("foo.bar" in config.events).toBe(false);
    expect("unknown.event" in config.events).toBe(false);
  });
});

describe("substituteString", () => {
  it("should replace {env:VAR_NAME} with the environment variable value", () => {
    process.env["TEST_SUBST_VAR"] = "hello-world";
    const result = substituteString("{env:TEST_SUBST_VAR}", "/tmp");
    delete process.env["TEST_SUBST_VAR"];
    expect(result).toBe("hello-world");
  });

  it("should replace {env:VAR_NAME} with empty string when the variable is not set", () => {
    delete process.env["NONEXISTENT_TEST_VAR_XYZ"];
    const result = substituteString("prefix-{env:NONEXISTENT_TEST_VAR_XYZ}-suffix", "/tmp");
    expect(result).toBe("prefix--suffix");
  });

  describe("{file:} substitution", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "subst-test-"));
    const tokenFile = join(tempDir, "token.txt");
    writeFileSync(tokenFile, "  my-secret-token  \n");

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should replace {file:/absolute/path} with trimmed file contents", () => {
      const result = substituteString(`{file:${tokenFile}}`, "/tmp");
      expect(result).toBe("my-secret-token");
    });

    it("should replace {file:relative} with trimmed file contents resolved from configDir", () => {
      const result = substituteString("{file:token.txt}", tempDir);
      expect(result).toBe("my-secret-token");
    });

    it("should replace {file:missing} with empty string when file does not exist", () => {
      const result = substituteString("{file:/nonexistent/path/to/file.txt}", "/tmp");
      expect(result).toBe("");
    });

    it("should replace {file:~/relative} with trimmed file contents resolved from home directory", () => {
      const homeRelDir = mkdtempSync(join(homedir(), ".subst-test-"));
      const homeRelFile = join(homeRelDir, "secret.txt");
      writeFileSync(homeRelFile, "  home-secret  \n");
      const relativePath = homeRelDir.slice(homedir().length + 1);
      try {
        const result = substituteString(`{file:~/${relativePath}/secret.txt}`, "/tmp");
        expect(result).toBe("home-secret");
      } finally {
        rmSync(homeRelDir, { recursive: true, force: true });
      }
    });
  });
});

describe("substituteVariables", () => {
  it("should recursively substitute {env:VAR} in nested objects and arrays", () => {
    process.env["TEST_SUBST_NESTED"] = "resolved-value";
    const input = {
      topLevel: "{env:TEST_SUBST_NESTED}",
      nested: {
        deep: "{env:TEST_SUBST_NESTED}",
        number: 42,
        bool: true,
      },
      list: ["{env:TEST_SUBST_NESTED}", "plain", 123],
    };
    const result = substituteVariables(input, "/tmp");
    delete process.env["TEST_SUBST_NESTED"];
    expect(result).toEqual({
      topLevel: "resolved-value",
      nested: {
        deep: "resolved-value",
        number: 42,
        bool: true,
      },
      list: ["resolved-value", "plain", 123],
    });
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
