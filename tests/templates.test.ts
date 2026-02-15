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
});
