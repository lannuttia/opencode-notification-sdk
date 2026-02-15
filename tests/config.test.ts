import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "../src/config.js";
import type { NotificationSDKConfig } from "../src/config.js";
import * as fs from "node:fs";

vi.mock("node:fs");

const DEFAULT_CONFIG: NotificationSDKConfig = {
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

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return default config when config file does not exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file or directory"), {
        code: "ENOENT",
      });
    });

    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("should parse a valid full config file", () => {
    const fileConfig = {
      enabled: false,
      subagentNotifications: "never",
      cooldown: {
        duration: "PT5M",
        edge: "trailing",
      },
      events: {
        "session.complete": { enabled: true },
        "subagent.complete": { enabled: false },
        "session.error": { enabled: true },
        "permission.requested": { enabled: false },
        "question.asked": { enabled: true },
      },
      templates: {
        "session.complete": {
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

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const config = loadConfig();
    expect(config).toEqual(fileConfig);
  });

  it("should throw a descriptive error when config file contains malformed JSON", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("{ not valid json }}}");

    expect(() => loadConfig()).toThrow(/Invalid notification config/);
  });

  it("should merge partial config with defaults", () => {
    const partialConfig = { enabled: false };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialConfig));

    const config = loadConfig();
    expect(config.enabled).toBe(false);
    expect(config.subagentNotifications).toBe("separate");
    expect(config.cooldown).toBeNull();
    expect(config.events["session.complete"].enabled).toBe(true);
    expect(config.events["subagent.complete"].enabled).toBe(true);
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.requested"].enabled).toBe(true);
    expect(config.events["question.asked"].enabled).toBe(true);
    expect(config.templates).toBeNull();
    expect(config.backends).toEqual({});
  });

  it("should merge partial events config with defaults, preserving unspecified events", () => {
    const partialConfig = {
      events: {
        "session.complete": { enabled: false },
      },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialConfig));

    const config = loadConfig();
    expect(config.events["session.complete"].enabled).toBe(false);
    expect(config.events["subagent.complete"].enabled).toBe(true);
    expect(config.events["session.error"].enabled).toBe(true);
    expect(config.events["permission.requested"].enabled).toBe(true);
    expect(config.events["question.asked"].enabled).toBe(true);
  });

  it("should use default cooldown edge when only duration is specified", () => {
    const partialConfig = {
      cooldown: { duration: "PT30S" },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialConfig));

    const config = loadConfig();
    expect(config.cooldown).toEqual({
      duration: "PT30S",
      edge: "leading",
    });
  });
});
