import { describe, it, expect } from "vitest";
import * as sdk from "../src/index.js";

describe("public API exports", () => {
  it("should export createNotificationPlugin function", () => {
    expect(typeof sdk.createNotificationPlugin).toBe("function");
  });

  it("should export loadConfig function", () => {
    expect(typeof sdk.loadConfig).toBe("function");
  });

  it("should export getBackendConfig function", () => {
    expect(typeof sdk.getBackendConfig).toBe("function");
  });

  it("should export parseISO8601Duration function", () => {
    expect(typeof sdk.parseISO8601Duration).toBe("function");
  });

  it("should export NOTIFICATION_EVENTS array with correct event types", () => {
    expect(sdk.NOTIFICATION_EVENTS).toEqual([
      "session.idle",
      "session.error",
      "permission.asked",
    ]);
  });
});
