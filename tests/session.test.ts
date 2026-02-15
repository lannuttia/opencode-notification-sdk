import { describe, it, expect, vi } from "vitest";
import { isChildSession, classifySession } from "../src/session.js";

/**
 * Creates a mock OpenCode client whose session.get() returns a session
 * with the given parentID (or undefined if omitted).
 */
function createMockClient(options: { parentID?: string } = {}) {
  return {
    session: {
      get: vi.fn().mockResolvedValue({
        data: {
          id: "test-session",
          projectID: "proj-1",
          directory: "/test",
          title: "Test Session",
          version: "1",
          time: { created: 0, updated: 0 },
          parentID: options.parentID,
        },
        error: undefined,
        request: new Request("http://localhost"),
        response: new Response(),
      }),
    },
  };
}

describe("isChildSession", () => {
  it("should return true when session has a parentID", async () => {
    const client = createMockClient({ parentID: "parent-123" });
    const result = await isChildSession(client, "child-456");
    expect(result).toBe(true);
    expect(client.session.get).toHaveBeenCalledWith({
      path: { id: "child-456" },
    });
  });

  it("should return false when session has no parentID", async () => {
    const client = createMockClient();
    const result = await isChildSession(client, "root-session");
    expect(result).toBe(false);
  });

  it("should return false when the API call throws an error", async () => {
    const client = {
      session: {
        get: vi.fn().mockRejectedValue(new Error("Connection refused")),
      },
    };
    const result = await isChildSession(client, "any-session");
    expect(result).toBe(false);
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
    const client = createMockClient();
    await classifySession(client, "any-session", "always");
    expect(client.session.get).not.toHaveBeenCalled();
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
