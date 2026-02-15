import { vi } from "vitest";
import type { PluginInput } from "@opencode-ai/plugin";

type BunShell = PluginInput["$"];

export interface MockShellResult {
  exitCode: number;
  stdout: string;
}

function createMockShellPromise(result: MockShellResult) {
  const stdoutBuffer = Buffer.from(result.stdout);
  const stderrBuffer = Buffer.from("");

  const output = {
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

function createShellObject(
  shellFn: ReturnType<typeof vi.fn>,
): BunShell {
  return Object.assign(shellFn, {
    braces: vi.fn(),
    escape: vi.fn(),
    env: vi.fn(),
    cwd: vi.fn(),
    nothrow: vi.fn(),
    throws: vi.fn(),
  });
}

export function createMockShell(result?: MockShellResult): BunShell {
  const defaultResult: MockShellResult = { exitCode: 0, stdout: "" };
  const shellFn = vi.fn(() => createMockShellPromise(result ?? defaultResult));
  return createShellObject(shellFn);
}

export function createThrowingMockShell(error: Error): BunShell {
  const shellFn = vi.fn(() => createThrowingMockShellPromise(error));
  return createShellObject(shellFn);
}
