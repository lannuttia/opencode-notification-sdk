import { describe, it, expect, vi } from "vitest";
import { resolveField } from "../src/templates.js";
import type { BunShell } from "@opencode-ai/plugin/shell";

function createMockShell(): BunShell {
  return Object.assign(
    () => {
      throw new Error("Mock shell: unexpected call");
    },
    {
      braces: vi.fn(),
      escape: vi.fn(),
      env: vi.fn(),
      cwd: vi.fn(),
      nothrow: vi.fn(),
      throws: vi.fn(),
    },
  );
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
});
