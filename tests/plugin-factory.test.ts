import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import type { NotificationContext, NotificationBackend } from "../src/types.js";
import type { NotificationSDKConfig } from "../src/config.js";
import { createNotificationPlugin } from "../src/plugin-factory.js";
import { createMockShell } from "./mock-shell.js";

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
      get: async () => ({
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

/**
 * Creates a NotificationBackend that captures all sent contexts into an array.
 * Returns both the backend and the captured contexts array.
 */
function createCapturingBackend(): {
  backend: NotificationBackend;
  sentContexts: NotificationContext[];
} {
  const sentContexts: NotificationContext[] = [];
  const backend: NotificationBackend = {
    send: async (context: NotificationContext) => {
      sentContexts.push(context);
    },
  };
  return { backend, sentContexts };
}

/**
 * Creates a NotificationBackend whose send() does nothing.
 * Used when we only care about whether send was NOT called.
 * Returns the backend and a way to check if send was called.
 */
function createTrackingBackend(): {
  backend: NotificationBackend;
  wasCalled: () => boolean;
} {
  let called = false;
  const backend: NotificationBackend = {
    send: async () => {
      called = true;
    },
  };
  return { backend, wasCalled: () => called };
}

describe("createNotificationPlugin", () => {
  it("should call backend.send() with default title/message when session.idle fires for a root session", async () => {
    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    expect(hooks.event).toBeDefined();

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

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

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, disabledConfig);
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  it("should not call backend.send() when the specific event type is disabled", async () => {
    const configWithDisabled = createDefaultConfig();
    configWithDisabled.events["session.complete"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, configWithDisabled);
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-123" },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  it("should not call backend.send() for child sessions when subagentNotifications is 'never'", async () => {
    const neverConfig = createDefaultConfig();
    neverConfig.subagentNotifications = "never";

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, neverConfig);
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "child-session" },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  it("should send subagent.complete for child sessions when subagentNotifications is 'separate'", async () => {
    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "child-session" },
      },
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("subagent.complete");
    expect(sentContexts[0].title).toBe("Sub-agent Complete");
    expect(sentContexts[0].metadata.isSubagent).toBe(true);
  });

  it("should send session.error notification with error metadata when session.error fires", async () => {
    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
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

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
    expect(sentContexts[0].title).toBe("Agent Error");
    expect(sentContexts[0].message).toBe(
      "An error occurred. Check the session for details.",
    );
    expect(sentContexts[0].metadata.error).toBe("something went wrong");
    expect(sentContexts[0].metadata.sessionId).toBe("sess-err-1");
  });

  it("should send permission.requested notification when permission.asked event fires", async () => {
    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    // permission.asked is not in the Event union type, so we need to
    // construct the event hook input manually to simulate the runtime event.
    // At runtime, OpenCode sends events not yet in the SDK's type union.
    const eventHook = hooks.event!;
    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: "sess-perm-1",
          type: "file.write",
          pattern: ["/tmp/*.txt"],
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await eventHook(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.requested");
    expect(sentContexts[0].title).toBe("Permission Requested");
    expect(sentContexts[0].message).toBe(
      "The agent needs permission to continue.",
    );
    expect(sentContexts[0].metadata.permissionType).toBe("file.write");
    expect(sentContexts[0].metadata.permissionPatterns).toEqual([
      "/tmp/*.txt",
    ]);
    expect(sentContexts[0].metadata.sessionId).toBe("sess-perm-1");
  });

  it("should send question.asked notification when tool.execute.before fires with question tool", async () => {
    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    expect(hooks["tool.execute.before"]).toBeDefined();

    await hooks["tool.execute.before"]!(
      { tool: "question", sessionID: "sess-q1", callID: "call-1" },
      { args: {} },
    );

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("question.asked");
    expect(sentContexts[0].title).toBe("Question Asked");
    expect(sentContexts[0].message).toBe(
      "The agent has a question and is waiting for your answer.",
    );
    expect(sentContexts[0].metadata.sessionId).toBe("sess-q1");
  });

  it("should not send notification when tool.execute.before fires with a non-question tool", async () => {
    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks["tool.execute.before"]!(
      { tool: "read", sessionID: "sess-r1", callID: "call-2" },
      { args: {} },
    );

    expect(wasCalled()).toBe(false);
  });

  it("should silently ignore errors thrown by backend.send()", async () => {
    const backend: NotificationBackend = {
      send: async () => {
        throw new Error("Network failure");
      },
    };

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    // Should not throw even though backend.send() rejects
    await expect(
      hooks.event!({
        event: {
          type: "session.idle",
          properties: { sessionID: "sess-err-swallow" },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("should use shell command template for title when configured", async () => {
    const configWithTemplate = createDefaultConfig();
    configWithTemplate.templates = {
      "session.complete": {
        titleCmd: "echo Custom {event} Title",
        messageCmd: null,
      },
    };

    const { backend, sentContexts } = createCapturingBackend();

    const $ = createMockShell({
      exitCode: 0,
      stdout: "Custom session.complete Title\n",
    });

    const plugin = createNotificationPlugin(backend, configWithTemplate);
    const input = createMockPluginInput();
    input.$ = $;
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-tpl-1" },
      },
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].title).toBe("Custom session.complete Title");
    // Message should still be the default since messageCmd is null
    expect(sentContexts[0].message).toBe(
      "The agent has finished and is waiting for input.",
    );
  });

  it("should silently ignore unrecognized event types", async () => {
    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, createDefaultConfig());
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    // message.updated is a real Event type but not one we handle
    await hooks.event!({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "sess-1",
            role: "user",
            time: { created: 0 },
            agent: "default",
            model: { providerID: "openai", modelID: "gpt-4" },
            tools: {},
          },
        },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  describe("rate limiting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should suppress repeated events within cooldown period with leading edge", async () => {
      const configWithCooldown = createDefaultConfig();
      configWithCooldown.cooldown = { duration: "PT30S", edge: "leading" };

      const { backend, sentContexts } = createCapturingBackend();

      const plugin = createNotificationPlugin(backend, configWithCooldown);
      const input = createMockPluginInput();
      const hooks = await plugin(input);

      const sessionIdleEvent = {
        event: {
          type: "session.idle" as const,
          properties: { sessionID: "sess-rl1" },
        },
      };

      // First call should go through
      await hooks.event!(sessionIdleEvent);
      expect(sentContexts).toHaveLength(1);

      // Second call within cooldown should be suppressed
      await hooks.event!(sessionIdleEvent);
      expect(sentContexts).toHaveLength(1);

      // After cooldown expires, should go through again
      vi.advanceTimersByTime(31000);
      await hooks.event!(sessionIdleEvent);
      expect(sentContexts).toHaveLength(2);
    });
  });
});
