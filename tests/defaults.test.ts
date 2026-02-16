import { describe, it, expect } from "vitest";
import { getDefaultTitle, getDefaultMessage } from "../src/defaults.js";

describe("getDefaultTitle", () => {
  it("should return 'Agent Idle' for session.idle", () => {
    expect(getDefaultTitle("session.idle")).toBe("Agent Idle");
  });

  it("should return 'Agent Error' for session.error", () => {
    expect(getDefaultTitle("session.error")).toBe("Agent Error");
  });

  it("should return 'Permission Asked' for permission.asked", () => {
    expect(getDefaultTitle("permission.asked")).toBe("Permission Asked");
  });
});

describe("getDefaultMessage", () => {
  it("should return idle message for session.idle", () => {
    expect(getDefaultMessage("session.idle")).toBe(
      "The agent has finished and is waiting for input.",
    );
  });

  it("should return error message for session.error", () => {
    expect(getDefaultMessage("session.error")).toBe(
      "An error occurred. Check the session for details.",
    );
  });

  it("should return permission message for permission.asked", () => {
    expect(getDefaultMessage("permission.asked")).toBe(
      "The agent needs permission to continue.",
    );
  });
});
