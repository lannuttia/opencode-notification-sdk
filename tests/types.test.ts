import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_EVENTS,
  EVENT_METADATA_REQUIRED_KEYS,
  EVENT_METADATA_OPTIONAL_KEYS,
} from "../src/types.js";

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

describe("EventMetadata", () => {
  it("should define required keys: sessionId, isSubagent, projectName, timestamp", () => {
    expect(EVENT_METADATA_REQUIRED_KEYS).toEqual([
      "sessionId",
      "isSubagent",
      "projectName",
      "timestamp",
    ]);
  });

  it("should define optional keys: error, permissionType, permissionPatterns", () => {
    expect(EVENT_METADATA_OPTIONAL_KEYS).toEqual([
      "error",
      "permissionType",
      "permissionPatterns",
    ]);
  });
});
