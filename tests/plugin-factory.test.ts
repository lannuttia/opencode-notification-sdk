import {
  describe,
  it,
  expect,
} from "vitest";
import type { NotificationContext, NotificationBackend } from "../src/types.js";
import type { NotificationSDKConfig } from "../src/config.js";
import { createNotificationPlugin } from "../src/plugin-factory.js";
import type { NotificationPluginContext } from "../src/plugin-factory.js";

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
 * Builds a minimal NotificationPluginContext for testing.
 *
 * The plugin only uses ctx.location.directory, ctx.event.subscribe(), and
 * ctx.session.get() — so we supply exactly those, with no mocking required.
 */
function createTestContext(overrides: {
  parentID?: string;
  directory?: string;
  sessionGetError?: boolean;
  events?: Array<{ type: string; data?: unknown }>;
}): NotificationPluginContext {
  const events = overrides.events ?? [];

  async function* eventStream(signal?: AbortSignal): AsyncIterable<{ type: string; data?: unknown }> {
    for (const event of events) {
      if (signal?.aborted) return;
      yield event;
    }
  }

  return {
    location: { directory: overrides.directory ?? "/test/project" },
    event: {
      subscribe: ({ signal }: { signal?: AbortSignal } = {}) => eventStream(signal),
    },
    session: {
      get: overrides.sessionGetError
        ? async () => { throw new Error("Connection refused"); }
        : async () => ({ parentID: overrides.parentID }),
    },
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

/**
 * Drives the plugin's setup and waits for it to process the given events.
 */
async function runPlugin(
  backend: NotificationBackend,
  config: NotificationSDKConfig,
  ctxOverrides: Parameters<typeof createTestContext>[0],
): Promise<void> {
  const plugin = createNotificationPlugin(backend, { config });
  const ctx = createTestContext(ctxOverrides);
  // setup() spawns an async event loop; give it a tick to drain the test events.
  const cleanup = await plugin.setup(ctx);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  if (typeof cleanup === "function") {
    await cleanup();
  }
}

describe("createNotificationPlugin", () => {
  it("should call backend.send() when session.idle fires for a root session", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-123" } }],
    });

    expect(sentContexts).toHaveLength(1);
    const context = sentContexts[0];
    expect(context.event).toBe("session.idle");
    expect(context.metadata.sessionId).toBe("sess-123");
    expect(context.metadata.projectName).toBe("project");
    expect("title" in context).toBe(false);
    expect("message" in context).toBe(false);
    expect("isSubagent" in context.metadata).toBe(false);
  });

  it("should not call backend.send() when config.enabled is false", async () => {
    const config = createDefaultTestConfig();
    config.enabled = false;

    const { backend, wasCalled } = createTrackingBackend();

    await runPlugin(backend, config, {
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-123" } }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should not call backend.send() when the specific event type is disabled", async () => {
    const config = createDefaultTestConfig();
    config.events["session.idle"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    await runPlugin(backend, config, {
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-123" } }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should not call session.get() when the event type is disabled (per-event check before subagent check)", async () => {
    const config = createDefaultTestConfig();
    config.events["session.idle"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();
    let sessionGetCalled = false;

    const plugin = createNotificationPlugin(backend, { config });
    const ctx: NotificationPluginContext = {
      ...createTestContext({ events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-check-order" } }] }),
      session: {
        get: async () => {
          sessionGetCalled = true;
          return { parentID: undefined };
        },
      },
    };

    const cleanup = await plugin.setup(ctx);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (typeof cleanup === "function") await cleanup();

    expect(wasCalled()).toBe(false);
    expect(sessionGetCalled).toBe(false);
  });

  it("should suppress session.idle for subagent (child) sessions", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      parentID: "parent-session",
      events: [{ type: "session.execution.succeeded", data: { sessionID: "child-session" } }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should suppress session.execution.failed for subagent (child) sessions", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      parentID: "parent-session",
      events: [{
        type: "session.execution.failed",
        data: {
          sessionID: "child-session",
          error: { type: "UnknownError", message: "child error" },
        },
      }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should fall through and send when session lookup fails for session.idle", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      sessionGetError: true,
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-unknown" } }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.idle");
  });

  it("should fall through and send when session lookup fails for session.execution.failed", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      sessionGetError: true,
      events: [{
        type: "session.execution.failed",
        data: {
          sessionID: "sess-unknown",
          error: { type: "UnknownError", message: "error" },
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
  });

  it("should send session.error notification with error metadata", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{
        type: "session.execution.failed",
        data: {
          sessionID: "sess-err-1",
          error: { type: "UnknownError", message: "something went wrong" },
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
    expect(sentContexts[0].metadata.error).toBe("something went wrong");
    expect(sentContexts[0].metadata.sessionId).toBe("sess-err-1");
  });

  it("should send permission.asked notification when permission.asked event fires", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{
        type: "permission.asked",
        data: {
          sessionID: "sess-perm-1",
          action: "file.write",
          resources: ["/tmp/*.txt"],
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    expect(sentContexts[0].metadata.permissionType).toBe("file.write");
    expect(sentContexts[0].metadata.permissionPatterns).toEqual(["/tmp/*.txt"]);
    expect(sentContexts[0].metadata.sessionId).toBe("sess-perm-1");
  });

  it("should send permission.asked even from subagent sessions (no subagent check for permission)", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      parentID: "parent-session",
      events: [{
        type: "permission.asked",
        data: {
          sessionID: "sess-perm-child",
          action: "file.write",
          resources: ["/tmp/*.txt"],
        },
      }],
    });

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

    // Should not throw
    await expect(
      runPlugin(backend, config, {
        events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-err-swallow" } }],
      }),
    ).resolves.toBeUndefined();
  });

  it("should silently ignore unrecognized event types", async () => {
    const { backend, wasCalled } = createTrackingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{ type: "message.updated", data: { info: { id: "msg-1" } } }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should accept options with backendConfigKey as second parameter", async () => {
    const config = createDefaultTestConfig();
    config.backend = { topic: "test-topic", server: "https://example.com" };

    const { backend, sentContexts } = createCapturingBackend();

    await runPlugin(backend, config, {
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-bc-1" } }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.idle");
  });

  it("should not call backend.send() when permission.asked event type is disabled", async () => {
    const config = createDefaultTestConfig();
    config.events["permission.asked"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    await runPlugin(backend, config, {
      events: [{
        type: "permission.asked",
        data: {
          sessionID: "sess-perm-disabled",
          action: "file.write",
          resources: ["/tmp/*.txt"],
        },
      }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should not call backend.send() when session.error event type is disabled", async () => {
    const config = createDefaultTestConfig();
    config.events["session.error"] = { enabled: false };

    const { backend, wasCalled } = createTrackingBackend();

    await runPlugin(backend, config, {
      events: [{
        type: "session.execution.failed",
        data: {
          sessionID: "sess-err-disabled",
          error: { type: "UnknownError", message: "should not send" },
        },
      }],
    });

    expect(wasCalled()).toBe(false);
  });

  it("should handle permission.asked with missing data gracefully", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{ type: "permission.asked" }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.permissionType).toBe("");
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should handle permission.asked with non-string sessionID and action gracefully", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{
        type: "permission.asked",
        data: {
          sessionID: 12345,
          action: { nested: true },
          resources: 42,
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.permissionType).toBe("");
    // Non-array resources should be undefined
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should handle permission.asked with an array of resources", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{
        type: "permission.asked",
        data: {
          sessionID: "sess-perm-str",
          action: "shell.execute",
          resources: ["rm -rf /tmp/*"],
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].metadata.permissionPatterns).toEqual(["rm -rf /tmp/*"]);
  });

  it("should derive projectName from the basename of the location directory", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      directory: "/home/user/projects/my-awesome-project",
      events: [{ type: "session.execution.succeeded", data: { sessionID: "sess-dir-1" } }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].metadata.projectName).toBe("my-awesome-project");
  });

  it("should handle permission.asked with mixed-type array resources by omitting patterns", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();

    await runPlugin(backend, config, {
      events: [{
        type: "permission.asked",
        data: {
          sessionID: "sess-perm-mixed",
          action: "file.write",
          resources: ["valid-string", 42, "another-string"],
        },
      }],
    });

    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("permission.asked");
    // Mixed-type array should not pass the every() check, so patterns should be undefined
    expect(sentContexts[0].metadata.permissionPatterns).toBeUndefined();
  });

  it("should skip subagent check when session.execution.failed has empty sessionID and still send", async () => {
    const { backend, sentContexts } = createCapturingBackend();
    const config = createDefaultTestConfig();
    let sessionGetCalled = false;

    const plugin = createNotificationPlugin(backend, { config });
    const ctx: NotificationPluginContext = {
      ...createTestContext({
        events: [{
          type: "session.execution.failed",
          data: {
            error: { type: "UnknownError", message: "error without session" },
          },
        }],
      }),
      session: {
        get: async () => {
          sessionGetCalled = true;
          return { parentID: undefined };
        },
      },
    };

    const cleanup = await plugin.setup(ctx);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    if (typeof cleanup === "function") await cleanup();

    // session.get() should NOT be called because sessionID is empty/missing
    expect(sessionGetCalled).toBe(false);
    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0].event).toBe("session.error");
    expect(sentContexts[0].metadata.sessionId).toBe("");
    expect(sentContexts[0].metadata.error).toBe("error without session");
  });

  it("plugin should have the correct id when no backendConfigKey is provided", async () => {
    const { backend } = createCapturingBackend();
    const plugin = createNotificationPlugin(backend);
    expect(plugin.id).toBe("opencode-notification");
  });

  it("plugin should have the correct id when backendConfigKey is provided", async () => {
    const { backend } = createCapturingBackend();
    const plugin = createNotificationPlugin(backend, { backendConfigKey: "ntfy" });
    expect(plugin.id).toBe("opencode-notification-ntfy");
  });
});
