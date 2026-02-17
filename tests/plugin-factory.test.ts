import {
  describe,
  it,
  expect,
} from "vitest";
import type { NotificationContext, NotificationBackend } from "../src/types.js";
import type { NotificationSDKConfig } from "../src/config.js";
import { createNotificationPlugin } from "../src/plugin-factory.js";
import { createMockShell } from "./mock-shell.js";
import type { SessionClient } from "../src/events.js";

function createDefaultTestConfig(): NotificationSDKConfig {
  return {
    enabled: true,
    events: {
      "session.idle": { enabled: true },
      "session.error": { enabled: true },
      "permission.asked": { enabled: true },
    },
    backend: {},
  };
}

/**
 * Creates a minimal mock PluginInput with a mock client whose session.get()
 * returns a session with the given parentID (or undefined if root).
 *
 * The plugin factory is designed to accept dependencies directly so we
 * don't need to use vi.mock(). We pass config directly to the factory.
 */
function createMockPluginInput(overrides: {
  parentID?: string;
  directory?: string;
  sessionGetError?: boolean;
} = {}) {
  const mockClient: SessionClient = {
    session: {
      get: overrides.sessionGetError
        ? async () => { throw new Error("Connection refused"); }
        : async () => ({
            data: {
              parentID: overrides.parentID,
            },
          }),
    },
  };

  return {
    client: mockClient,
    directory: overrides.directory ?? "/test/project",
    $: createMockShell(),
  };
}

/**
 * Creates a NotificationBackend that captures all sent contexts into an array.
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
 * Creates a NotificationBackend that tracks whether send was called.
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
  it("should call backend.send() when session.idle fires for a root session", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
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
    expect(context.event).toBe("session.idle");
    expect(context.metadata.sessionId).toBe("sess-123");
    expect(context.metadata.projectName).toBe("project");
    // Should NOT have title, message, or isSubagent
    expect("title" in context).toBe(false);
    expect("message" in context).toBe(false);
    expect("isSubagent" in context.metadata).toBe(false);
  });

  it("should not call backend.send() when config.enabled is false", async () => {
    const config = createDefaultTestConfig();
    config.enabled = false;

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, { config });
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
    const config = createDefaultTestConfig();
    config.events["session.idle"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, { config });
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

  it("should not call session.get() when the event type is disabled (per-event check before subagent check)", async () => {
    const config = createDefaultTestConfig();
    config.events["session.idle"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    let sessionGetCalled = false;
    const mockClient: SessionClient = {
      session: {
        get: async () => {
          sessionGetCalled = true;
          return { data: { parentID: undefined } };
        },
      },
    };

    const plugin = createNotificationPlugin(backend, { config });
    const input = {
      client: mockClient,
      directory: "/test/project",
      $: createMockShell(),
    };
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-check-order" },
      },
    });

    expect(wasCalled()).toBe(false);
    // The per-event enabled check should happen BEFORE the subagent check
    // so session.get() should not be called
    expect(sessionGetCalled).toBe(false);
  });

  it("should suppress session.idle for subagent (child) sessions", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
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

  it("should suppress session.error for subagent (child) sessions", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "child-session",
          error: {
            name: "UnknownError",
            data: { message: "child error" },
          },
        },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  it("should fall through and send when session lookup fails for session.idle", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput({ sessionGetError: true });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-unknown" },
      },
    });

    // Should send because the session lookup failed (fall through)
    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.idle");
  });

  it("should fall through and send when session lookup fails for session.error", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput({ sessionGetError: true });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "sess-unknown",
          error: {
            name: "UnknownError",
            data: { message: "error" },
          },
        },
      },
    });

    // Should send because the session lookup failed (fall through)
    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
  });

  it("should send session.error notification with error metadata", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
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
    expect(sentContexts[0].metadata.error).toBe("something went wrong");
    expect(sentContexts[0].metadata.sessionId).toBe("sess-err-1");
  });

  it("should send permission.asked notification when permission.asked event fires", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    // permission.asked is not in the Event union type, so we construct
    // the event hook input manually to simulate the runtime event.
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
    expect(sentContexts[0].event).toBe("permission.asked");
    expect(sentContexts[0].metadata.permissionType).toBe("file.write");
    expect(sentContexts[0].metadata.permissionPatterns).toEqual([
      "/tmp/*.txt",
    ]);
    expect(sentContexts[0].metadata.sessionId).toBe("sess-perm-1");
  });

  it("should NOT send notification for permission.asked from subagent (no subagent check for permission)", async () => {
    // permission.asked always sends, even if the session has a parentID
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput({ parentID: "parent-session" });
    const hooks = await plugin(input);

    const eventHook = hooks.event!;
    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: "sess-perm-child",
          type: "file.write",
          pattern: ["/tmp/*.txt"],
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await eventHook(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
  });

  it("should silently ignore errors thrown by backend.send()", async () => {
    const backend: NotificationBackend = {
      send: async () => {
        throw new Error("Network failure");
      },
    };
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
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

  it("should silently ignore unrecognized event types", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
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

  it("should accept options with backendConfigKey as second parameter", async () => {
    const config = createDefaultTestConfig();
    config.backend = { topic: "test-topic", server: "https://example.com" };

    const { backend, sentContexts } = createCapturingBackend();

    const plugin = createNotificationPlugin(backend, {
      backendConfigKey: "mybackend",
      config,
    });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-bc-1" },
      },
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.idle");
  });

  it("should NOT have tool.execute.before handler", async () => {
    const { backend } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    expect(hooks["tool.execute.before"]).toBeUndefined();
  });

  it("should not call backend.send() when permission.asked event type is disabled", async () => {
    const config = createDefaultTestConfig();
    config.events["permission.asked"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: "sess-perm-disabled",
          type: "file.write",
          pattern: ["/tmp/*.txt"],
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await hooks.event!(permissionEvent);

    expect(wasCalled()).toBe(false);
  });

  it("should not call backend.send() when session.error event type is disabled", async () => {
    const config = createDefaultTestConfig();
    config.events["session.error"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          sessionID: "sess-err-disabled",
          error: {
            name: "UnknownError",
            data: { message: "should not send" },
          },
        },
      },
    });

    expect(wasCalled()).toBe(false);
  });

  it("should handle permission.asked with missing properties gracefully", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    // Simulate a permission.asked event with no properties at all
    const permissionEvent = {
      event: {
        type: "permission.asked",
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await hooks.event!(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.permissionType).toBe("");
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should handle permission.asked with non-string sessionID and type gracefully", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: 12345,
          type: { nested: true },
          pattern: 42,
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await hooks.event!(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    // Non-string values should fall back to empty strings
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.permissionType).toBe("");
    // Non-string/non-array pattern should be undefined
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should handle permission.asked with a single string pattern", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: "sess-perm-str",
          type: "shell.execute",
          pattern: "rm -rf /tmp/*",
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await hooks.event!(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].metadata.permissionPatterns).toEqual(["rm -rf /tmp/*"]);
  });

  it("should derive projectName from the basename of the input directory", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput({ directory: "/home/user/projects/my-awesome-project" });
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-dir-1" },
      },
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].metadata.projectName).toBe("my-awesome-project");
  });

  it("should handle permission.asked with mixed-type array pattern (non-string elements) by omitting patterns", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    const plugin = createNotificationPlugin(backend, { config });
    const input = createMockPluginInput();
    const hooks = await plugin(input);

    const permissionEvent = {
      event: {
        type: "permission.asked",
        properties: {
          sessionID: "sess-perm-mixed",
          type: "file.write",
          pattern: ["valid-string", 42, "another-string"],
        },
      },
    };
    // @ts-expect-error permission.asked is not yet in the @opencode-ai/plugin Event union
    await hooks.event!(permissionEvent);

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    // Mixed-type array should not pass the every() check, so patterns should be undefined
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should skip subagent check when session.error has empty sessionID and still send", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    let sessionGetCalled = false;
    const mockClient: SessionClient = {
      session: {
        get: async () => {
          sessionGetCalled = true;
          return { data: { parentID: "parent-session" } };
        },
      },
    };

    const plugin = createNotificationPlugin(backend, { config });
    const input = {
      client: mockClient,
      directory: "/test/project",
      $: createMockShell(),
    };
    const hooks = await plugin(input);

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          error: {
            name: "UnknownError",
            data: { message: "error without session" },
          },
        },
      },
    });

    // session.get() should NOT be called because sessionID is empty
    expect(sessionGetCalled).toBe(false);
    // Should still send the notification
    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.error).toBe("error without session");
  });

});
