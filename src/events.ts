import type { EventMetadata, NotificationEvent } from "./types.js";

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

interface ErrorWithMessage {
  data: { message: string };
}

function isErrorWithMessage(value: unknown): value is ErrorWithMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "message" in value.data &&
    typeof value.data.message === "string"
  );
}

export function extractSessionErrorMetadata(
  properties: { sessionID?: string; error?: unknown },
  projectName: string,
): EventMetadata {
  const metadata: EventMetadata = {
    sessionId: properties.sessionID ?? "",
    isSubagent: false,
    projectName,
    timestamp: new Date().toISOString(),
  };

  if (isErrorWithMessage(properties.error)) {
    metadata.error = properties.error.data.message;
  }

  return metadata;
}

export function extractPermissionMetadata(
  properties: {
    sessionID: string;
    type: string;
    pattern?: string | string[];
  },
  projectName: string,
): EventMetadata {
  const metadata: EventMetadata = {
    sessionId: properties.sessionID,
    isSubagent: false,
    projectName,
    timestamp: new Date().toISOString(),
    permissionType: properties.type,
  };

  if (properties.pattern !== undefined) {
    metadata.permissionPatterns = Array.isArray(properties.pattern)
      ? properties.pattern
      : [properties.pattern];
  }

  return metadata;
}

export function extractQuestionMetadata(
  input: { sessionID: string },
  projectName: string,
): EventMetadata {
  return {
    sessionId: input.sessionID,
    isSubagent: false,
    projectName,
    timestamp: new Date().toISOString(),
  };
}

export function buildTemplateVariables(
  event: NotificationEvent,
  metadata: EventMetadata,
): Record<string, string> {
  return {
    event,
    time: metadata.timestamp,
    project: metadata.projectName,
    session_id: metadata.sessionId,
    error: metadata.error ?? "",
    permission_type: metadata.permissionType ?? "",
    permission_patterns: metadata.permissionPatterns?.join(",") ?? "",
  };
}
