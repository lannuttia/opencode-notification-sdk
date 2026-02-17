import { describe, it, expect } from "vitest";
import { resolveField, renderTemplate, execCommand } from "../src/templates.js";
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

describe("resolveField", () => {
  it("should return fallback when command template is null", async () => {
    const $ = createMockShell();
    const result = await resolveField($, null, {}, "default title");
    expect(result).toBe("default title");
  });

  it("should return fallback when command template is undefined", async () => {
    const $ = createMockShell();
    const result = await resolveField($, undefined, {}, "default message");
    expect(result).toBe("default message");
  });

  it("should execute command and return trimmed stdout on success", async () => {
    const $ = createMockShell({ exitCode: 0, stdout: "  custom title  \n" });
    const result = await resolveField($, "echo custom title", {}, "fallback");
    expect(result).toBe("custom title");
  });

  it("should substitute {var_name} placeholders in the command template", async () => {
    const { $, getCapturedCommands } = createCapturingMockShell({
      exitCode: 0,
      stdout: "session.complete in my-project\n",
    });
    const variables = { event: "session.complete", project: "my-project" };
    await resolveField($, "echo {event} in {project}", variables, "fallback");

    const commands = getCapturedCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe("echo session.complete in my-project");
  });

  it("should return fallback when command throws an exception", async () => {
    const $ = createThrowingMockShell(new Error("command not found"));
    const result = await resolveField($, "nonexistent-cmd", {}, "fallback value");
    expect(result).toBe("fallback value");
  });

  it("should return fallback when command produces empty stdout", async () => {
    const $ = createMockShell({ exitCode: 0, stdout: "" });
    const result = await resolveField($, "echo -n", {}, "fallback for empty");
    expect(result).toBe("fallback for empty");
  });

  it("should return fallback when command produces whitespace-only stdout", async () => {
    const $ = createMockShell({ exitCode: 0, stdout: "   \n\t  " });
    const result = await resolveField($, "echo", {}, "fallback for whitespace");
    expect(result).toBe("fallback for whitespace");
  });

  it("should substitute unset variables with empty strings", async () => {
    const { $, getCapturedCommands } = createCapturingMockShell({
      exitCode: 0,
      stdout: "hello \n",
    });
    const variables = { event: "session.complete" };
    await resolveField($, "echo {event} {missing_var}", variables, "fallback");

    const commands = getCapturedCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe("echo session.complete ");
  });

  it("should return fallback when command exits with non-zero exit code", async () => {
    const $ = createMockShell({ exitCode: 1, stdout: "some output" });
    const result = await resolveField($, "failing-cmd", {}, "fallback for error");
    expect(result).toBe("fallback for error");
  });
});
