import { describe, it, expect } from "vitest";
import { extractSessionIdleMetadata } from "../src/events.js";

describe("extractSessionIdleMetadata", () => {
  it("should extract sessionId and projectName from session.idle event properties", () => {
    const metadata = extractSessionIdleMetadata(
      { sessionID: "sess-123" },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-123");
    expect(metadata.projectName).toBe("my-project");
    expect(metadata.isSubagent).toBe(false);
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.error).toBeUndefined();
    expect(metadata.permissionType).toBeUndefined();
    expect(metadata.permissionPatterns).toBeUndefined();
  });
});
