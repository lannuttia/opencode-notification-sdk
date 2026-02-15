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
});
