import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationContext, NotificationBackend } from "../src/types.js";
import { createMockShell } from "./mock-shell.js";
import * as configModule from "../src/config.js";

vi.mock("../src/config.js");

/**
 * Creates a minimal mock PluginInput with a mock client whose session.get()
 * returns a root session (no parentID).
 */
function createMockPluginInput(overrides: {
  parentID?: string;
  directory?: string;
} = {}) {
  const mockClient = {
    session: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: "test-session",
          parentID: overrides.parentID,
        },
      }),
    },
  };

  return {
    client: mockClient,
    project: {
      id: "proj-1",
      worktree: "/test/project",
      time: { created: 0 },
    },
    directory: overrides.directory ?? "/test/project",
    worktree: "/test/project",
    serverUrl: new URL("http://localhost:3000"),
    $: createMockShell(),
  };
}

function createDefaultConfig(): configModule.NotificationSDKConfig {
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

describe("createNotificationPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(configModule.loadConfig).mockReturnValue(createDefaultConfig());
  });

  it("should call backend.send() with default title/message when session.idle fires for a root session", async () => {
    const { createNotificationPlugin } = await import(
      "../src/plugin-factory.js"
    );

    const sentContexts: NotificationContext[] = [];
    const backend: NotificationBackend = {
      send: vi.fn(async (context: NotificationContext) => {
        sentContexts.push(context);
      }),
    };

    const plugin = createNotificationPlugin(backend);
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    expect(hooks.event).toBeDefined();

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

    expect(backend.send).toHaveBeenCalledOnce();
    expect(sentContexts).toHaveLength(1);

    const context = sentContexts[0];
    expect(context.event).toBe("session.complete");
    expect(context.title).toBe("Agent Idle");
    expect(context.message).toBe(
      "The agent has finished and is waiting for input.",
    );
    expect(context.metadata.sessionId).toBe("sess-123");
    expect(context.metadata.isSubagent).toBe(false);
    expect(context.metadata.projectName).toBe("project");
  });
});
