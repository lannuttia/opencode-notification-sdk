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

  it("should export renderTemplate function", () => {
    expect(typeof sdk.renderTemplate).toBe("function");
  });

  it("should export execCommand function", () => {
    expect(typeof sdk.execCommand).toBe("function");
  });

  it("should export execTemplate function", () => {
    expect(typeof sdk.execTemplate).toBe("function");
  });

  it("should NOT export NOTIFICATION_EVENTS (not in spec public API)", () => {
    expect("NOTIFICATION_EVENTS" in sdk).toBe(false);
  });

  it("should NOT export parseConfigFile (not in spec public API)", () => {
    expect("parseConfigFile" in sdk).toBe(false);
  });

  it("should only export the spec-required value exports", () => {
    // The spec requires exactly these value (non-type) exports:
    // createNotificationPlugin, renderTemplate, execCommand, execTemplate,
    // loadConfig, getBackendConfig
    const exportedKeys = Object.keys(sdk);
    const expectedKeys = [
      "createNotificationPlugin",
      "renderTemplate",
      "execCommand",
      "execTemplate",
      "loadConfig",
      "getBackendConfig",
    ];
    expect(exportedKeys.sort()).toEqual(expectedKeys.sort());
  });
});
