import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_EVENTS,
  isRecord,
} from "../src/types.js";
import type {
  NotificationContext,
  NotificationBackend,
} from "../src/types.js";

describe("NotificationEvent", () => {
  it("should define all 3 canonical event types", () => {
    expect(NOTIFICATION_EVENTS).toEqual([
      "session.idle",
      "session.error",
      "permission.asked",
    ]);
  });

  it("should have exactly 3 event types", () => {
    expect(NOTIFICATION_EVENTS).toHaveLength(3);
  });
});

describe("NotificationContext", () => {
  it("should be constructable with event and metadata only (no title or message)", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "abc-123",
        projectName: "my-project",
        timestamp: "2026-02-14T00:00:00Z",
      },
    };
    expect(context.event).toBe("session.idle");
    expect(context.metadata.sessionId).toBe("abc-123");
    expect("title" in context).toBe(false);
    expect("message" in context).toBe(false);
  });

  it("should not have isSubagent on metadata", () => {
    const context: NotificationContext = {
      event: "session.error",
      metadata: {
        sessionId: "xyz-789",
        projectName: "test-project",
        timestamp: "2026-02-14T12:00:00Z",
        error: "Connection timeout",
      },
    };
    // Verify isSubagent does not exist as a property
    expect("isSubagent" in context.metadata).toBe(false);
  });
});

describe("isRecord", () => {
  it("should return true for a plain object", () => {
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("should return true for an empty object", () => {
    expect(isRecord({})).toBe(true);
  });

  it("should return false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("should return false for an array", () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("should return false for a string", () => {
    expect(isRecord("hello")).toBe(false);
  });

  it("should return false for a number", () => {
    expect(isRecord(42)).toBe(false);
  });

  it("should return false for a boolean", () => {
    expect(isRecord(true)).toBe(false);
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
      metadata: {
        sessionId: "xyz-789",
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
