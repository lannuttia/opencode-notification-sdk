import type { EventMetadata } from "./types.js";

export function extractSessionIdleMetadata(
  properties: { sessionID: string },
  projectName: string,
): EventMetadata {
  return {
    sessionId: properties.sessionID,
    isSubagent: false,
    projectName,
    timestamp: new Date().toISOString(),
  };
}
