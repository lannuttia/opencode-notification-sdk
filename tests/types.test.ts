import { describe, it, expect } from "vitest";
import { NOTIFICATION_EVENTS } from "../src/types.js";

describe("NotificationEvent", () => {
  it("should define all 5 canonical event types", () => {
    expect(NOTIFICATION_EVENTS).toEqual([
      "session.complete",
      "subagent.complete",
      "session.error",
      "permission.requested",
      "question.asked",
    ]);
  });

  it("should have exactly 5 event types", () => {
    expect(NOTIFICATION_EVENTS).toHaveLength(5);
  });
});
