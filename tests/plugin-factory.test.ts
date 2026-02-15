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

  it("should not call backend.send() when config.enabled is false", async () => {
    const disabledConfig = createDefaultConfig();
    disabledConfig.enabled = false;
    vi.mocked(configModule.loadConfig).mockReturnValue(disabledConfig);

    const { createNotificationPlugin } = await import(
      "../src/plugin-factory.js"
    );

    const backend: NotificationBackend = {
      send: vi.fn(),
    };

    const plugin = createNotificationPlugin(backend);
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

    expect(backend.send).not.toHaveBeenCalled();
  });

  it("should not call backend.send() when the specific event type is disabled", async () => {
    const configWithDisabled = createDefaultConfig();
    configWithDisabled.events["session.complete"] = { enabled: false };
    vi.mocked(configModule.loadConfig).mockReturnValue(configWithDisabled);

    const { createNotificationPlugin } = await import(
      "../src/plugin-factory.js"
    );

    const backend: NotificationBackend = {
      send: vi.fn(),
    };

    const plugin = createNotificationPlugin(backend);
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

    expect(backend.send).not.toHaveBeenCalled();
  });

  it("should not call backend.send() for child sessions when subagentNotifications is 'never'", async () => {
    const neverConfig = createDefaultConfig();
    neverConfig.subagentNotifications = "never";
    vi.mocked(configModule.loadConfig).mockReturnValue(neverConfig);

    const { createNotificationPlugin } = await import(
      "../src/plugin-factory.js"
    );

    const backend: NotificationBackend = {
      send: vi.fn(),
    };

    const plugin = createNotificationPlugin(backend);
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "child-session" },
      },
    });

    expect(backend.send).not.toHaveBeenCalled();
  });

  it("should send subagent.complete for child sessions when subagentNotifications is 'separate'", async () => {
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
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "child-session" },
      },
    });

    expect(backend.send).toHaveBeenCalledOnce();
    expect(sentContexts[0].event).toBe("subagent.complete");
    expect(sentContexts[0].title).toBe("Sub-agent Complete");
    expect(sentContexts[0].metadata.isSubagent).toBe(true);
  });

  it("should send session.error notification with error metadata when session.error fires", async () => {
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

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "sess-err-1",
          error: {
            name: "UnknownError",
            data: { message: "something went wrong" },
          },
        },
      },
    });

    expect(backend.send).toHaveBeenCalledOnce();
    expect(sentContexts[0].event).toBe("session.error");
    expect(sentContexts[0].title).toBe("Agent Error");
    expect(sentContexts[0].message).toBe(
      "An error occurred. Check the session for details.",
    );
    expect(sentContexts[0].metadata.error).toBe("something went wrong");
    expect(sentContexts[0].metadata.sessionId).toBe("sess-err-1");
  });
});
