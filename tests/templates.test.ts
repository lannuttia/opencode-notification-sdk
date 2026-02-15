import { describe, it, expect } from "vitest";
import { resolveField } from "../src/templates.js";
import { createMockShell, createThrowingMockShell, createCapturingMockShell } from "./mock-shell.js";

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
