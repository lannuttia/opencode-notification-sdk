import { describe, it, expect, vi } from "vitest";
import { resolveField } from "../src/templates.js";
import type { BunShell, BunShellOutput } from "@opencode-ai/plugin/shell";

interface MockShellResult {
  exitCode: number;
  stdout: string;
}

function createMockShellPromise(result: MockShellResult) {
  const stdoutBuffer = Buffer.from(result.stdout);
  const stderrBuffer = Buffer.from("");

  const output: BunShellOutput = {
    stdout: stdoutBuffer,
    stderr: stderrBuffer,
    exitCode: result.exitCode,
    text: () => result.stdout,
    json: () => JSON.parse(result.stdout),
    arrayBuffer: () => stdoutBuffer.buffer,
    bytes: () => new Uint8Array(stdoutBuffer),
    blob: () => new Blob([stdoutBuffer]),
  };

  const basePromise = Promise.resolve(output);

  // Create a self-referencing chainable mock promise
  const mockPromise = Object.assign(basePromise, {
    stdin: new WritableStream(),
    cwd: function () {
      return mockPromise;
    },
    env: function () {
      return mockPromise;
    },
    quiet: function () {
      return mockPromise;
    },
    lines: function () {
      throw new Error("not implemented");
    },
    text: () => Promise.resolve(result.stdout),
    json: () => Promise.resolve(JSON.parse(result.stdout)),
    arrayBuffer: () => Promise.resolve(stdoutBuffer.buffer),
    blob: () => Promise.resolve(new Blob([stdoutBuffer])),
    nothrow: function () {
      return mockPromise;
    },
    throws: function () {
      return mockPromise;
    },
  });

  return mockPromise;
}

function createThrowingMockShellPromise(error: Error) {
  const rejectingPromise = Promise.reject(error);
  // Prevent unhandled rejection warnings during test setup
  rejectingPromise.catch(() => {});

  return Object.assign(rejectingPromise, {
    stdin: new WritableStream(),
    cwd: function () {
      return rejectingPromise;
    },
    env: function () {
      return rejectingPromise;
    },
    quiet: function () {
      return rejectingPromise;
    },
    lines: function () {
      throw new Error("not implemented");
    },
    text: () => Promise.reject(error),
    json: () => Promise.reject(error),
    arrayBuffer: () => Promise.reject(error),
    blob: () => Promise.reject(error),
    nothrow: function () {
      return rejectingPromise;
    },
    throws: function () {
      return rejectingPromise;
    },
  });
}

function createMockShell(result?: MockShellResult): BunShell {
  const defaultResult: MockShellResult = { exitCode: 0, stdout: "" };
  const shellFn = vi.fn(() => createMockShellPromise(result ?? defaultResult));

  return Object.assign(shellFn, {
    braces: vi.fn(),
    escape: vi.fn(),
    env: vi.fn(),
    cwd: vi.fn(),
    nothrow: vi.fn(),
    throws: vi.fn(),
  });
}

function createThrowingMockShell(error: Error): BunShell {
  const shellFn = vi.fn(() => createThrowingMockShellPromise(error));

  return Object.assign(shellFn, {
    braces: vi.fn(),
    escape: vi.fn(),
    env: vi.fn(),
    cwd: vi.fn(),
    nothrow: vi.fn(),
    throws: vi.fn(),
  });
}

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
    const $ = createMockShell({ exitCode: 0, stdout: "session.complete in my-project\n" });
    const variables = { event: "session.complete", project: "my-project" };
    await resolveField($, "echo {event} in {project}", variables, "fallback");

    // The shell function should have been called with the substituted command
    const shellFn = vi.mocked($);
    expect(shellFn).toHaveBeenCalledOnce();
    const callArgs = shellFn.mock.calls[0];
    // Tagged template: first arg is strings array, rest are expressions
    // The expression should contain the raw substituted command
    const expressions = callArgs.slice(1);
    const rawExpression = expressions[0];
    expect(rawExpression).toHaveProperty("raw", "echo session.complete in my-project");
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
    const $ = createMockShell({ exitCode: 0, stdout: "hello \n" });
    const variables = { event: "session.complete" };
    await resolveField($, "echo {event} {missing_var}", variables, "fallback");

    const shellFn = vi.mocked($);
    const callArgs = shellFn.mock.calls[0];
    const expressions = callArgs.slice(1);
    const rawExpression = expressions[0];
    expect(rawExpression).toHaveProperty("raw", "echo session.complete ");
  });

  it("should return fallback when command exits with non-zero exit code", async () => {
    const $ = createMockShell({ exitCode: 1, stdout: "some output" });
    const result = await resolveField($, "failing-cmd", {}, "fallback for error");
    expect(result).toBe("fallback for error");
  });
});
