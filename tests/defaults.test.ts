import { describe, it, expect } from "vitest";
import { getDefaultTitle, getDefaultMessage } from "../src/defaults.js";

describe("getDefaultTitle", () => {
  it("should return 'Agent Idle' for session.complete", () => {
    expect(getDefaultTitle("session.complete")).toBe("Agent Idle");
  });

  it("should return 'Sub-agent Complete' for subagent.complete", () => {
    expect(getDefaultTitle("subagent.complete")).toBe("Sub-agent Complete");
  });

  it("should return 'Agent Error' for session.error", () => {
    expect(getDefaultTitle("session.error")).toBe("Agent Error");
  });

  it("should return 'Permission Requested' for permission.requested", () => {
    expect(getDefaultTitle("permission.requested")).toBe(
      "Permission Requested",
    );
  });

  it("should return 'Question Asked' for question.asked", () => {
    expect(getDefaultTitle("question.asked")).toBe("Question Asked");
  });
});

describe("getDefaultMessage", () => {
  it("should return idle message for session.complete", () => {
    expect(getDefaultMessage("session.complete")).toBe(
      "The agent has finished and is waiting for input.",
    );
  });

  it("should return sub-agent message for subagent.complete", () => {
    expect(getDefaultMessage("subagent.complete")).toBe(
      "A sub-agent has completed its task.",
    );
  });

  it("should return error message for session.error", () => {
    expect(getDefaultMessage("session.error")).toBe(
      "An error occurred. Check the session for details.",
    );
  });

  it("should return permission message for permission.requested", () => {
    expect(getDefaultMessage("permission.requested")).toBe(
      "The agent needs permission to continue.",
    );
  });

  it("should return question message for question.asked", () => {
    expect(getDefaultMessage("question.asked")).toBe(
      "The agent has a question and is waiting for your answer.",
    );
  });
});
