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

  it("should NOT export NOTIFICATION_EVENTS (not in spec public API)", () => {
    expect("NOTIFICATION_EVENTS" in sdk).toBe(false);
  });

  it("should NOT export parseConfigFile (not in spec public API)", () => {
    expect("parseConfigFile" in sdk).toBe(false);
  });

  it("should only export the spec-required value exports", () => {
    // The spec requires exactly these value (non-type) exports:
    // createNotificationPlugin, loadConfig, getBackendConfig, parseISO8601Duration
    const exportedKeys = Object.keys(sdk);
    const expectedKeys = [
      "createNotificationPlugin",
      "loadConfig",
      "getBackendConfig",
      "parseISO8601Duration",
    ];
    expect(exportedKeys.sort()).toEqual(expectedKeys.sort());
  });
});
