import type { PluginInput } from "@opencode-ai/plugin";

type BunShell = PluginInput["$"];

/**
 * Type guard: checks if a value is an object with a string `raw` property.
 * Used to extract raw command strings from shell template expressions.
 */
function hasStringRaw(value: unknown): value is { raw: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "raw" in value &&
    typeof value.raw === "string"
  );
}

export interface MockShellResult {
  exitCode: number;
  stdout: string;
}

/**
 * Creates a mock BunShellPromise that resolves with the given result.
 *
 * The mock implements just enough of the BunShellPromise interface for the
 * SDK's `resolveField` function: `.nothrow()`, `.quiet()`, then `.text()` and
 * `.exitCode` on the resolved output.
 *
 * We build a self-referential object so that chained calls like
 * `promise.nothrow().quiet()` return the same mock, satisfying the `this`
 * return-type constraint of BunShellPromise.
 */
function createMockShellPromise(result: MockShellResult): ReturnType<BunShell> {
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

  const mockPromise: ReturnType<BunShell> = Object.assign(basePromise, {
    stdin: new WritableStream(),
    cwd: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    env: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    quiet: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    lines: function (): AsyncIterable<string> {
      throw new Error("not implemented");
    },
    text: () => Promise.resolve(result.stdout),
    json: () => Promise.resolve(JSON.parse(result.stdout)),
    arrayBuffer: () => Promise.resolve(stdoutBuffer.buffer),
    blob: () => Promise.resolve(new Blob([stdoutBuffer])),
    nothrow: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    throws: function (): ReturnType<BunShell> {
      return mockPromise;
    },
  });

  return mockPromise;
}

function createThrowingMockShellPromise(error: Error): ReturnType<BunShell> {
  const rejectingBase = Promise.reject(error);
  // Prevent unhandled rejection warnings during test setup
  rejectingBase.catch(() => {});

  const mockPromise: ReturnType<BunShell> = Object.assign(rejectingBase, {
    stdin: new WritableStream(),
    cwd: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    env: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    quiet: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    lines: function (): AsyncIterable<string> {
      throw new Error("not implemented");
    },
    text: () => Promise.reject(error),
    json: () => Promise.reject(error),
    arrayBuffer: () => Promise.reject(error),
    blob: () => Promise.reject(error),
    nothrow: function (): ReturnType<BunShell> {
      return mockPromise;
    },
    throws: function (): ReturnType<BunShell> {
      return mockPromise;
    },
  });

  return mockPromise;
}

function createShellObject(
  shellFn: (...args: unknown[]) => ReturnType<BunShell>,
): BunShell {
  // Build self-referential shell: methods like env/cwd/nothrow/throws return
  // the shell itself, matching the BunShell interface contract.
  const shell: BunShell = Object.assign(
    shellFn,
    {
      braces: (): string[] => [],
      escape: (input: string): string => input,
      env: (): BunShell => shell,
      cwd: (): BunShell => shell,
      nothrow: (): BunShell => shell,
      throws: (): BunShell => shell,
    },
  );
  return shell;
}

export function createMockShell(result?: MockShellResult): BunShell {
  const defaultResult: MockShellResult = { exitCode: 0, stdout: "" };
  const shellFn = () => createMockShellPromise(result ?? defaultResult);
  return createShellObject(shellFn);
}

export function createThrowingMockShell(error: Error): BunShell {
  const shellFn = () => createThrowingMockShellPromise(error);
  return createShellObject(shellFn);
}

/**
 * Creates a mock shell that captures the raw command strings passed to it.
 * Returns the shell and a function to retrieve captured commands.
 * This avoids needing vi.fn() / vi.mocked() to inspect call arguments.
 */
export function createCapturingMockShell(result?: MockShellResult): {
  $: BunShell;
  getCapturedCommands: () => string[];
} {
  const defaultResult: MockShellResult = { exitCode: 0, stdout: "" };
  const capturedCommands: string[] = [];

  const shellFn = (...args: unknown[]) => {
    // Tagged template: first arg is TemplateStringsArray, rest are expressions.
    // resolveField passes $`${{ raw: command }}`, so the expression is { raw: string }.
    const expressions = args.slice(1);
    for (const expr of expressions) {
      if (hasStringRaw(expr)) {
        capturedCommands.push(expr.raw);
      }
    }
    return createMockShellPromise(result ?? defaultResult);
  };

  return {
    $: createShellObject(shellFn),
    getCapturedCommands: () => [...capturedCommands],
  };
}
