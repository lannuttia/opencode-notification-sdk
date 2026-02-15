import { describe, it, expect } from "vitest";
import {
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  extractPermissionMetadata,
} from "../src/events.js";

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

describe("extractSessionErrorMetadata", () => {
  it("should extract error message from session.error event with UnknownError", () => {
    const metadata = extractSessionErrorMetadata(
      {
        sessionID: "sess-456",
        error: { name: "UnknownError", data: { message: "something broke" } },
      },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-456");
    expect(metadata.projectName).toBe("my-project");
    expect(metadata.isSubagent).toBe(false);
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.error).toBe("something broke");
    expect(metadata.permissionType).toBeUndefined();
    expect(metadata.permissionPatterns).toBeUndefined();
  });

  it("should handle missing sessionID in session.error event", () => {
    const metadata = extractSessionErrorMetadata(
      {
        error: { name: "UnknownError", data: { message: "no session" } },
      },
      "my-project",
    );

    expect(metadata.sessionId).toBe("");
    expect(metadata.error).toBe("no session");
  });

  it("should handle missing error in session.error event", () => {
    const metadata = extractSessionErrorMetadata(
      { sessionID: "sess-789" },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-789");
    expect(metadata.error).toBeUndefined();
  });
});

describe("extractPermissionMetadata", () => {
  it("should extract permissionType and permissionPatterns from permission properties", () => {
    const metadata = extractPermissionMetadata(
      {
        sessionID: "sess-perm-1",
        type: "file.write",
        pattern: ["/tmp/*.txt", "/home/*.log"],
      },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-perm-1");
    expect(metadata.projectName).toBe("my-project");
    expect(metadata.isSubagent).toBe(false);
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.permissionType).toBe("file.write");
    expect(metadata.permissionPatterns).toEqual(["/tmp/*.txt", "/home/*.log"]);
    expect(metadata.error).toBeUndefined();
  });

  it("should handle a single string pattern", () => {
    const metadata = extractPermissionMetadata(
      {
        sessionID: "sess-perm-2",
        type: "shell.execute",
        pattern: "rm -rf /tmp/*",
      },
      "my-project",
    );

    expect(metadata.permissionType).toBe("shell.execute");
    expect(metadata.permissionPatterns).toEqual(["rm -rf /tmp/*"]);
  });

  it("should handle missing pattern", () => {
    const metadata = extractPermissionMetadata(
      {
        sessionID: "sess-perm-3",
        type: "network.access",
      },
      "my-project",
    );

    expect(metadata.permissionType).toBe("network.access");
    expect(metadata.permissionPatterns).toBeUndefined();
  });
});
