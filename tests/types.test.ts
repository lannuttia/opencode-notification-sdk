import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_EVENTS,
} from "../src/types.js";
import type {
  NotificationContext,
  NotificationBackend,
} from "../src/types.js";

describe("NotificationEvent", () => {
  it("should define all 5 canonical event types", () => {
    expect(NOTIFICATION_EVENTS).toEqual([
      "session.complete",
      "subagent.complete",
      "session.error",
      "permission.requested",
      "question.asked",
    ]);
  });

  it("should have exactly 5 event types", () => {
    expect(NOTIFICATION_EVENTS).toHaveLength(5);
  });
});

describe("NotificationContext", () => {
  it("should be constructable with valid fields", () => {
    const context: NotificationContext = {
      event: "session.complete",
      title: "Agent Idle",
      message: "The agent has finished.",
      metadata: {
        sessionId: "abc-123",
        isSubagent: false,
        projectName: "my-project",
        timestamp: "2026-02-14T00:00:00Z",
      },
    };
    expect(context.event).toBe("session.complete");
    expect(context.title).toBe("Agent Idle");
    expect(context.message).toBe("The agent has finished.");
    expect(context.metadata.sessionId).toBe("abc-123");
  });
});

describe("NotificationBackend", () => {
  it("should accept an object with a send method returning a Promise", async () => {
    const sentContexts: NotificationContext[] = [];
    const backend: NotificationBackend = {
      send: async (context) => {
        sentContexts.push(context);
      },
    };
    const context: NotificationContext = {
      event: "session.error",
      title: "Error",
      message: "Something went wrong.",
      metadata: {
        sessionId: "xyz-789",
        isSubagent: false,
        projectName: "test-project",
        timestamp: "2026-02-14T12:00:00Z",
        error: "Connection timeout",
      },
    };
    await backend.send(context);
    expect(sentContexts).toHaveLength(1);
    expect(sentContexts[0]).toBe(context);
  });
});
