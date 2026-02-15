import { describe, it, expect, vi } from "vitest";
import { isChildSession, classifySession } from "../src/session.js";
import type { SessionClient } from "../src/session.js";

/**
 * Creates a mock OpenCode client whose session.get() returns a session
 * with the given parentID (or undefined if omitted).
 *
 * Uses a plain async function by default. Pass `trackCalls: true` to get
 * a vi.fn() wrapper that supports call assertions.
 */
function createMockClient(options: { parentID?: string } = {}): SessionClient {
  return {
    session: {
      get: async () => ({
        data: {
          id: "test-session",
          parentID: options.parentID,
        },
      }),
    },
  };
}

/**
 * Creates a client whose session.get() rejects with the given error.
 */
function createFailingClient(error: Error): SessionClient {
  return {
    session: {
      get: async () => {
        throw error;
      },
    },
  };
}

describe("isChildSession", () => {
  it("should return true when session has a parentID", async () => {
    const client = createMockClient({ parentID: "parent-123" });
    const result = await isChildSession(client, "child-456");
    expect(result).toBe(true);
  });

  it("should return false when session has no parentID", async () => {
    const client = createMockClient();
    const result = await isChildSession(client, "root-session");
    expect(result).toBe(false);
  });

  it("should return false when the API call throws an error", async () => {
    const client = createFailingClient(new Error("Connection refused"));
    const result = await isChildSession(client, "any-session");
    expect(result).toBe(false);
  });

  it("should pass the correct session ID to client.session.get()", async () => {
    // This test specifically verifies the argument passing, so vi.fn() is needed
    const getFn = vi.fn(async () => ({
      data: { id: "test-session", parentID: undefined },
    }));
    const client: SessionClient = { session: { get: getFn } };

    await isChildSession(client, "my-session-id");
    expect(getFn).toHaveBeenCalledWith({ path: { id: "my-session-id" } });
  });
});

describe("classifySession", () => {
  it("should return 'session.complete' for root session in 'separate' mode", async () => {
    const client = createMockClient();
    const result = await classifySession(client, "root-session", "separate");
    expect(result).toBe("session.complete");
  });

  it("should return 'subagent.complete' for child session in 'separate' mode", async () => {
    const client = createMockClient({ parentID: "parent-123" });
    const result = await classifySession(client, "child-session", "separate");
    expect(result).toBe("subagent.complete");
  });

  it("should return 'session.complete' for child session in 'always' mode", async () => {
    const client = createMockClient({ parentID: "parent-123" });
    const result = await classifySession(client, "child-session", "always");
    expect(result).toBe("session.complete");
  });

  it("should return 'session.complete' for root session in 'always' mode", async () => {
    const client = createMockClient();
    const result = await classifySession(client, "root-session", "always");
    expect(result).toBe("session.complete");
  });

  it("should not call client.session.get() in 'always' mode", async () => {
    // This test verifies a negative call, so vi.fn() is needed
    const getFn = vi.fn(async () => ({
      data: { id: "test-session", parentID: undefined },
    }));
    const client: SessionClient = { session: { get: getFn } };

    await classifySession(client, "any-session", "always");
    expect(getFn).not.toHaveBeenCalled();
  });

  it("should return null for child session in 'never' mode", async () => {
    const client = createMockClient({ parentID: "parent-123" });
    const result = await classifySession(client, "child-session", "never");
    expect(result).toBeNull();
  });

  it("should return 'session.complete' for root session in 'never' mode", async () => {
    const client = createMockClient();
    const result = await classifySession(client, "root-session", "never");
    expect(result).toBe("session.complete");
  });
});
