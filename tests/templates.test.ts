import { describe, it, expect } from "vitest";
import { renderTemplate, execCommand, execTemplate } from "../src/templates.js";
import type { NotificationContext } from "../src/types.js";
import { createMockShell, createThrowingMockShell, createCapturingMockShell } from "./mock-shell.js";

describe("renderTemplate", () => {
  it("should substitute {event} placeholder with the event type", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-1",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = renderTemplate("Event: {event}", context);
    expect(result).toBe("Event: session.idle");
  });

  it("should substitute all available variables from context", () => {
    const context: NotificationContext = {
      event: "session.error",
      metadata: {
        sessionId: "sess-2",
        projectName: "test-proj",
        timestamp: "2026-02-16T12:00:00Z",
        error: "Connection timeout",
      },
    };
    const result = renderTemplate("{event} in {project} at {time} - {error}", context);
    expect(result).toBe("session.error in test-proj at 2026-02-16T12:00:00Z - Connection timeout");
  });

  it("should substitute unrecognized variables with empty strings", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-3",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = renderTemplate("{event} {unknown_var}", context);
    expect(result).toBe("session.idle ");
  });

  it("should substitute permission variables when present", () => {
    const context: NotificationContext = {
      event: "permission.asked",
      metadata: {
        sessionId: "sess-4",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
        permissionType: "file.write",
        permissionPatterns: ["/tmp/*.txt", "/home/*.log"],
      },
    };
    const result = renderTemplate("{permission_type}: {permission_patterns}", context);
    expect(result).toBe("file.write: /tmp/*.txt,/home/*.log");
  });

  it("should substitute optional fields with empty strings when not present", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-5",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = renderTemplate("{error}{permission_type}{permission_patterns}", context);
    expect(result).toBe("");
  });

  it("should substitute {session_id} with the session ID", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-abc-123",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = renderTemplate("Session: {session_id}", context);
    expect(result).toBe("Session: sess-abc-123");
  });

  it("should return the template unchanged when no placeholders are present", () => {
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-1",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = renderTemplate("No placeholders here", context);
    expect(result).toBe("No placeholders here");
  });
});

describe("execCommand", () => {
  it("should return trimmed stdout when command succeeds (exit code 0)", async () => {
    const $ = createMockShell({ exitCode: 0, stdout: "  hello world  \n" });
    const result = await execCommand($, "echo hello world");
    expect(result).toBe("hello world");
  });

  it("should reject when command fails (non-zero exit code)", async () => {
    const $ = createMockShell({ exitCode: 1, stdout: "error output" });
    await expect(execCommand($, "failing-cmd")).rejects.toThrow();
  });

  it("should reject when command throws an exception", async () => {
    const $ = createThrowingMockShell(new Error("command not found"));
    await expect(execCommand($, "nonexistent-cmd")).rejects.toThrow("command not found");
  });
});

describe("execTemplate", () => {
  it("should render template variables and execute the resulting command", async () => {
    const { $, getCapturedCommands } = createCapturingMockShell({
      exitCode: 0,
      stdout: "session.idle in my-project\n",
    });
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-1",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    const result = await execTemplate($, "echo {event} in {project}", context);
    expect(result).toBe("session.idle in my-project");

    const commands = getCapturedCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe("echo session.idle in my-project");
  });

  it("should reject when the executed command fails", async () => {
    const $ = createMockShell({ exitCode: 1, stdout: "" });
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "sess-1",
        projectName: "my-project",
        timestamp: "2026-02-16T00:00:00Z",
      },
    };
    await expect(execTemplate($, "failing-cmd {event}", context)).rejects.toThrow();
  });
});

