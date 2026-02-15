import { describe, it, expect, vi } from "vitest";
import { isChildSession } from "../src/session.js";

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
});
