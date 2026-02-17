import { describe, it, expect } from "vitest";
import {
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  extractPermissionMetadata,
  buildTemplateVariables,
  isSubagentSession,
} from "../src/events.js";
import type { SessionClient } from "../src/events.js";

describe("isSubagentSession", () => {
  it("should return true when session has a parentID", async () => {
    const client: SessionClient = {
      session: {
        get: async () => ({
          data: { parentID: "parent-123" },
        }),
      },
    };
    const result = await isSubagentSession(client, "child-456");
    expect(result).toBe(true);
  });

  it("should return false when session has no parentID", async () => {
    const client: SessionClient = {
      session: {
        get: async () => ({
          data: { parentID: undefined },
        }),
      },
    };
    const result = await isSubagentSession(client, "root-session");
    expect(result).toBe(false);
  });

  it("should return false when the API call throws an error (fall through to send)", async () => {
    const client: SessionClient = {
      session: {
        get: async () => {
          throw new Error("Connection refused");
        },
      },
    };
    const result = await isSubagentSession(client, "any-session");
    expect(result).toBe(false);
  });

  it("should return false when session data is undefined", async () => {
    const client: SessionClient = {
      session: {
        get: async () => ({
          data: undefined,
        }),
      },
    };
    const result = await isSubagentSession(client, "any-session");
    expect(result).toBe(false);
  });

  it("should return false when parentID is an empty string", async () => {
    const client: SessionClient = {
      session: {
        get: async () => ({
          data: { parentID: "" },
        }),
      },
    };
    const result = await isSubagentSession(client, "root-session");
    expect(result).toBe(false);
  });
});

describe("extractSessionIdleMetadata", () => {
  it("should extract sessionId and projectName from session.idle event properties", () => {
    const metadata = extractSessionIdleMetadata(
      { sessionID: "sess-123" },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-123");
    expect(metadata.projectName).toBe("my-project");
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.error).toBeUndefined();
    expect(metadata.permissionType).toBeUndefined();
    expect(metadata.permissionPatterns).toBeUndefined();
    // Should NOT have isSubagent
    expect("isSubagent" in metadata).toBe(false);
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
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.error).toBe("something broke");
    expect(metadata.permissionType).toBeUndefined();
    expect(metadata.permissionPatterns).toBeUndefined();
    // Should NOT have isSubagent
    expect("isSubagent" in metadata).toBe(false);
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

  it("should not extract error when error is a plain string", () => {
    const metadata = extractSessionErrorMetadata(
      { sessionID: "sess-str", error: "just a string" },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-str");
    expect(metadata.error).toBeUndefined();
  });

  it("should not extract error when error.data is missing", () => {
    const metadata = extractSessionErrorMetadata(
      { sessionID: "sess-nodata", error: { name: "SomeError" } },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-nodata");
    expect(metadata.error).toBeUndefined();
  });

  it("should not extract error when error.data.message is not a string", () => {
    const metadata = extractSessionErrorMetadata(
      { sessionID: "sess-badmsg", error: { data: { message: 42 } } },
      "my-project",
    );

    expect(metadata.sessionId).toBe("sess-badmsg");
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
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.permissionType).toBe("file.write");
    expect(metadata.permissionPatterns).toEqual(["/tmp/*.txt", "/home/*.log"]);
    expect(metadata.error).toBeUndefined();
    // Should NOT have isSubagent
    expect("isSubagent" in metadata).toBe(false);
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

describe("buildTemplateVariables", () => {
  it("should build variables for a session.idle event", () => {
    const vars = buildTemplateVariables("session.idle", {
      sessionId: "sess-tv1",
      projectName: "my-project",
      timestamp: "2026-02-14T12:00:00.000Z",
    });

    expect(vars.event).toBe("session.idle");
    expect(vars.time).toBe("2026-02-14T12:00:00.000Z");
    expect(vars.project).toBe("my-project");
    expect(vars.session_id).toBe("sess-tv1");
    expect(vars.error).toBe("");
    expect(vars.permission_type).toBe("");
    expect(vars.permission_patterns).toBe("");
  });

  it("should build variables for a session.error event with error metadata", () => {
    const vars = buildTemplateVariables("session.error", {
      sessionId: "sess-tv2",
      projectName: "my-project",
      timestamp: "2026-02-14T12:00:00.000Z",
      error: "something broke",
    });

    expect(vars.error).toBe("something broke");
  });

  it("should build variables for a permission.asked event with patterns", () => {
    const vars = buildTemplateVariables("permission.asked", {
      sessionId: "sess-tv3",
      projectName: "my-project",
      timestamp: "2026-02-14T12:00:00.000Z",
      permissionType: "file.write",
      permissionPatterns: ["/tmp/*.txt", "/home/*.log"],
    });

    expect(vars.permission_type).toBe("file.write");
    expect(vars.permission_patterns).toBe("/tmp/*.txt,/home/*.log");
  });
});
