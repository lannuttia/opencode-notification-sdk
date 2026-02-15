import type { EventMetadata, NotificationEvent } from "./types.js";

function createBaseMetadata(
  sessionID: string,
  projectName: string,
): EventMetadata {
  return {
    sessionId: sessionID,
    isSubagent: false,
    projectName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract event metadata from a `session.idle` event's properties.
 *
 * @param properties - The event properties containing the session ID.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the idle event.
 */
export function extractSessionIdleMetadata(
  properties: { sessionID: string },
  projectName: string,
): EventMetadata {
  return createBaseMetadata(properties.sessionID, projectName);
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

/**
 * Extract event metadata from a `session.error` event's properties.
 *
 * If the error object contains a `data.message` string, it is included
 * in the metadata's `error` field.
 *
 * @param properties - The event properties, optionally containing session ID and error info.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the error event.
 */
export function extractSessionErrorMetadata(
  properties: { sessionID?: string; error?: unknown },
  projectName: string,
): EventMetadata {
  const metadata = createBaseMetadata(properties.sessionID ?? "", projectName);

  if (isErrorWithMessage(properties.error)) {
    metadata.error = properties.error.data.message;
  }

  return metadata;
}

/**
 * Extract event metadata from a `permission.asked` event's properties.
 *
 * Populates the `permissionType` and `permissionPatterns` fields on the
 * returned metadata.
 *
 * @param properties - The event properties containing session ID, permission type, and optional patterns.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the permission event.
 */
export function extractPermissionMetadata(
  properties: {
    sessionID: string;
    type: string;
    pattern?: string | string[];
  },
  projectName: string,
): EventMetadata {
  const metadata = createBaseMetadata(properties.sessionID, projectName);
  metadata.permissionType = properties.type;

  if (properties.pattern !== undefined) {
    metadata.permissionPatterns = Array.isArray(properties.pattern)
      ? properties.pattern
      : [properties.pattern];
  }

  return metadata;
}

/**
 * Build a template variables record for shell command substitution.
 *
 * Creates a flat `Record<string, string>` mapping variable names to their
 * values, suitable for `{var_name}` substitution in shell command templates.
 *
 * @param event - The canonical notification event type.
 * @param metadata - The event metadata from which to extract variable values.
 * @returns A record of template variable names to string values.
 */
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
